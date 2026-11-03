import Foundation
import UserNotifications
import UIKit

// MARK: - Modèle

enum Door: String, Codable, CaseIterable, Identifiable {
    case frontLeft, frontRight, rearLeft, rearRight, trunk, hood
    var id: String { rawValue }

    var name: String {
        switch self {
        case .frontLeft: return "Avant gauche (conducteur)"
        case .frontRight: return "Avant droite (passager)"
        case .rearLeft: return "Arrière gauche"
        case .rearRight: return "Arrière droite"
        case .trunk: return "Coffre"
        case .hood: return "Capot"
        }
    }

    var shortName: String {
        switch self {
        case .frontLeft: return "AVG"
        case .frontRight: return "AVD"
        case .rearLeft: return "ARG"
        case .rearRight: return "ARD"
        case .trunk: return "Coffre"
        case .hood: return "Capot"
        }
    }
}

/// Identifiant de donnée de diagnostic : service 0x21 (Renault KWP, identifiant 1 octet) ou 0x22 (UDS, 2 octets).
struct DIDKey: Codable, Hashable, Comparable {
    var service: UInt8
    var id: UInt16

    var command: String { service == 0x21 ? String(format: "21%02X", id) : String(format: "22%04X", id) }
    var positiveHeader: String { service == 0x21 ? String(format: "61%02X", id) : String(format: "62%04X", id) }
    var label: String { service == 0x21 ? String(format: "21 %02X", id) : String(format: "22 %04X", id) }

    static func < (a: DIDKey, b: DIDKey) -> Bool { (a.service, a.id) < (b.service, b.id) }
}

/// Bit d'une réponse qui indique l'ouverture d'un ouvrant.
struct DoorSignal: Codable, Hashable {
    var key: DIDKey
    var byteIndex: Int
    var mask: UInt8
    var openWhenSet: Bool

    var label: String {
        "\(key.label) · octet \(byteIndex) · bit \(mask.trailingZeroBitCount) (\(openWhenSet ? "1" : "0") = ouvert)"
    }

    func isOpen(_ bytes: [UInt8]) -> Bool? {
        guard byteIndex < bytes.count else { return nil }
        let set = bytes[byteIndex] & mask != 0
        return set == openWhenSet
    }
}

struct DIDRange: Identifiable, Hashable {
    let service: UInt8
    let from: UInt16
    let to: UInt16
    var id: String { "\(service)-\(from)-\(to)" }
    var count: Int { Int(to) - Int(from) + 1 }
    var label: String {
        service == 0x21 ? String(format: "21 %02X → %02X", from, to) : String(format: "22 %04X → %04X", from, to)
    }
    var keys: [DIDKey] { (from...to).map { DIDKey(service: service, id: $0) } }

    static let presets: [DIDRange] = [
        DIDRange(service: 0x21, from: 0x00, to: 0xFF),
        DIDRange(service: 0x22, from: 0x0100, to: 0x01FF),
        DIDRange(service: 0x22, from: 0x0200, to: 0x02FF),
        DIDRange(service: 0x22, from: 0x2000, to: 0x21FF),
        DIDRange(service: 0x22, from: 0x4000, to: 0x40FF),
        DIDRange(service: 0x22, from: 0x5000, to: 0x50FF),
        DIDRange(service: 0x22, from: 0xF100, to: 0xF1FF),
    ]
}

struct ECUAddress: Codable, Hashable, Identifiable {
    var name: String
    var request: String   // ex. "745"
    var response: String  // ex. "765"
    var id: String { request + response }

    /// Adresses de diagnostic CAN habituelles du groupe Renault (Dacia, Renault, Alpine).
    static let presets: [ECUAddress] = [
        ECUAddress(name: "UCH / boîtier carrosserie (BCM)", request: "745", response: "765"),
        ECUAddress(name: "Tableau de bord", request: "743", response: "763"),
        ECUAddress(name: "Boîtier habitacle (BCM, variante)", request: "74D", response: "76D"),
    ]
}

struct DoorConfig: Codable {
    var ecu: ECUAddress = ECUAddress.presets[0]
    var signals: [Door: DoorSignal] = [:]
    var monitoringEnabled = true
    var notifyWhenOpen = true
    /// Lecture des portières toutes les N boucles d'interrogation OBD.
    var pollEvery = 3

    private static let key = "doorConfig.v1"

    static func load() -> DoorConfig {
        guard let d = UserDefaults.standard.data(forKey: key),
              let c = try? JSONDecoder().decode(DoorConfig.self, from: d) else { return DoorConfig() }
        return c
    }

    func save() {
        if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: Self.key) }
    }

    var isConfigured: Bool { !signals.isEmpty }
}

// MARK: - Dialogue avec le calculateur

extension OBDManager {

    /// Commandes ELM327 pour adresser un calculateur précis (CAN 11 bits) puis revenir au mode OBD standard.
    private func enterECUCommands(_ ecu: ECUAddress) -> [String] {
        ["ATSH\(ecu.request)", "ATCRA\(ecu.response)", "ATFCSH\(ecu.request)", "ATFCSD300000", "ATFCSM1"]
    }
    private var exitECUCommands: [String] { ["ATFCSM0", "ATCRA", "ATSH7DF"] }

    var canAddressECUs: Bool { isCAN }

    func parseDID(_ response: String?, key: DIDKey) -> [UInt8]? {
        guard let response else { return nil }
        let hex = joinedHex(response)
        guard let r = hex.range(of: key.positiveHeader) else { return nil }
        let bytes = hexBytes(String(hex[r.upperBound...]))
        return bytes.isEmpty ? nil : bytes
    }

    /// Lit une liste d'identifiants sur le calculateur choisi. La boucle temps réel est suspendue pendant la lecture.
    func readDIDs(_ keys: [DIDKey], ecu: ECUAddress,
                  progress: ((Double) -> Void)? = nil,
                  completion: @escaping ([DIDKey: [UInt8]]) -> Void) {
        if state == .demo {
            completion(demoDIDs(keys))
            return
        }
        guard state == .connected else { completion([:]); return }
        pollGeneration += 1 // suspend la boucle
        scanToken += 1
        let token = scanToken
        var results: [DIDKey: [UInt8]] = [:]
        var done = 0
        appendLog("→ Lecture de \(keys.count) identifiant(s) sur \(ecu.request)/\(ecu.response)")
        for c in enterECUCommands(ecu) { send(c) { _ in } }
        send("1001", timeout: 2) { _ in }
        for key in keys {
            send(key.command, timeout: 2) { [weak self] r in
                guard let self, token == self.scanToken else { return }
                if let b = self.parseDID(r, key: key) { results[key] = b }
                done += 1
                progress?(Double(done) / Double(max(1, keys.count)))
            }
        }
        for c in exitECUCommands { send(c) { _ in } }
        send("ATDPN") { [weak self] _ in
            guard let self, token == self.scanToken else { return }
            self.appendLog("✓ \(results.count) identifiant(s) ont répondu")
            completion(results)
            self.resumePolling()
        }
    }

    func cancelDIDRead() {
        guard state == .connected else { return }
        scanToken += 1
        queue.removeAll()
        for c in exitECUCommands { send(c) { _ in } }
        send("ATDPN") { [weak self] _ in self?.resumePolling() }
    }

    func resumePolling() {
        guard state == .connected else { return }
        pollGeneration += 1
        poll(gen: pollGeneration)
    }

    /// Appelé par la boucle temps réel : insère une lecture des portières toutes les `pollEvery` boucles.
    func enqueueDoorPollIfNeeded() {
        let cfg = doorConfig
        guard cfg.monitoringEnabled, cfg.isConfigured, isCAN else { return }
        doorPollCounter += 1
        guard doorPollCounter % max(1, cfg.pollEvery) == 0 else { return }
        let keys = Array(Set(cfg.signals.values.map(\.key))).sorted()
        for c in enterECUCommands(cfg.ecu) { send(c) { _ in } }
        var results: [DIDKey: [UInt8]] = [:]
        for key in keys {
            send(key.command, timeout: 2) { [weak self] r in
                if let b = self?.parseDID(r, key: key) { results[key] = b }
            }
        }
        for c in exitECUCommands.dropLast() { send(c) { _ in } }
        send(exitECUCommands.last!) { [weak self] _ in self?.applyDoorResults(results) }
    }

    func applyDoorResults(_ results: [DIDKey: [UInt8]]) {
        guard !results.isEmpty else { return }
        var newStates = doorStates
        for (door, sig) in doorConfig.signals {
            if let bytes = results[sig.key], let open = sig.isOpen(bytes) { newStates[door] = open }
        }
        let opened = newStates.filter { $0.value && doorStates[$0.key] != true }.map(\.key)
        doorStates = newStates
        lastDoorRead = Date()
        if !opened.isEmpty { DoorAlerts.alert(opened: opened, speed: values[.speed]) }
    }

    // MARK: Démo

    func demoDoors() {
        // Dans le simulateur, la porte arrière gauche s'ouvre quelques secondes toutes les 20 s.
        let cycle = Int(demoTick) % 20
        let open = cycle >= 15
        var s: [Door: Bool] = [:]
        for d in Door.allCases where d != .hood { s[d] = (d == .rearLeft) ? open : false }
        if s[.rearLeft] == true, doorStates[.rearLeft] != true { DoorAlerts.alert(opened: [.rearLeft], speed: values[.speed]) }
        doorStates = s
        lastDoorRead = Date()
    }

    private func demoDIDs(_ keys: [DIDKey]) -> [DIDKey: [UInt8]] {
        var out: [DIDKey: [UInt8]] = [:]
        for k in keys where k.id % 37 == 0 { out[k] = [0x00, 0x10, UInt8(k.id & 0xFF)] }
        return out
    }
}

// MARK: - Apprentissage

/// Compare les lectures « tout fermé » / « porte ouverte » / « porte refermée » pour isoler le bit qui code l'ouvrant.
enum DoorLearning {
    static func candidates(closedA: [DIDKey: [UInt8]], closedB: [DIDKey: [UInt8]],
                           open: [DIDKey: [UInt8]], closedAgain: [DIDKey: [UInt8]]) -> [DoorSignal] {
        var out: [DoorSignal] = []
        for key in open.keys.sorted() {
            guard let a = closedA[key], let o = open[key], let c = closedAgain[key] else { continue }
            let b = closedB[key] ?? a
            guard a.count == o.count, o.count == c.count, b.count == a.count else { continue }
            for i in 0..<a.count {
                let noisy = a[i] ^ b[i]               // bits qui bougent seuls (compteurs…)
                let changed = (a[i] ^ o[i]) & ~noisy  // bits modifiés par l'ouverture
                let reverted = ~(a[i] ^ c[i])         // bits revenus à l'état fermé
                let good = changed & reverted
                guard good != 0 else { continue }
                for bit in 0..<8 where good & (1 << bit) != 0 {
                    let mask = UInt8(1 << bit)
                    out.append(DoorSignal(key: key, byteIndex: i, mask: mask, openWhenSet: o[i] & mask != 0))
                }
            }
        }
        return out
    }
}

// MARK: - Alertes

enum DoorAlerts {
    private static var lastAlert: Date = .distantPast

    static func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func alert(opened: [Door], speed: Double?) {
        guard OBDManager.notificationsEnabled, Date().timeIntervalSince(lastAlert) > 3 else { return }
        lastAlert = Date()
        let names = opened.map(\.name).joined(separator: ", ")
        let moving = (speed ?? 0) > 5
        UINotificationFeedbackGenerator().notificationOccurred(moving ? .error : .warning)

        let content = UNMutableNotificationContent()
        content.title = moving ? "⚠️ Portière ouverte en roulant !" : "Portière ouverte"
        content.body = opened.count == 1 ? "\(names) est ouverte." : "Ouvertes : \(names)."
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}

extension OBDManager {
    static var notificationsEnabled: Bool { DoorConfig.load().notifyWhenOpen }
}

/// Affiche les notifications même lorsque l'application est au premier plan.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
