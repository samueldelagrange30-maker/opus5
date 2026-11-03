import Foundation
import CoreBluetooth

/// Gère la connexion Bluetooth Low Energy à un adaptateur ELM327 (Vgate iCar Pro, Veepeak BLE, OBDLink CX…)
/// ainsi que le dialogue OBD-II (commandes AT + PIDs mode 01, 03, 04, 09).
///
/// Les callbacks CoreBluetooth sont reçus sur la file principale (queue: nil),
/// ce qui permet de mettre à jour directement les propriétés @Published.
final class OBDManager: NSObject, ObservableObject {

    enum ConnectionState: Equatable {
        case idle, bluetoothOff, unauthorized, scanning, connecting, initializing, connected, demo
        case failed(String)

        var label: String {
            switch self {
            case .idle: return "Déconnecté"
            case .bluetoothOff: return "Bluetooth désactivé"
            case .unauthorized: return "Accès Bluetooth refusé"
            case .scanning: return "Recherche d'adaptateurs…"
            case .connecting: return "Connexion…"
            case .initializing: return "Initialisation de l'ELM327…"
            case .connected: return "Connecté"
            case .demo: return "Mode démo"
            case .failed(let msg): return msg
            }
        }

        var isLive: Bool { self == .connected || self == .demo }
    }

    struct Device: Identifiable, Equatable {
        let id: UUID
        let name: String
        var rssi: Int
        let peripheral: CBPeripheral
        var likelyOBD: Bool {
            let n = name.lowercased()
            return ["obd", "elm", "vlink", "v-link", "icar", "vgate", "veepeak", "obdlink", "konnwei", "carista", "ios-vlink", "android-vlink"].contains { n.contains($0) }
        }
    }

    // MARK: - État publié

    @Published private(set) var state: ConnectionState = .idle
    @Published private(set) var devices: [Device] = []
    @Published private(set) var values: [OBDPID: Double] = [:]
    @Published private(set) var supportedPIDs: Set<UInt8> = []
    @Published private(set) var batteryVoltage: Double?
    @Published private(set) var adapterVersion: String?
    @Published private(set) var protocolName: String?
    @Published private(set) var vin: String?
    @Published private(set) var milOn: Bool?
    @Published private(set) var storedDTCCount: Int?
    @Published private(set) var dtcs: [DTC] = []
    @Published private(set) var pendingDTCs: [DTC] = []
    @Published private(set) var lastDTCRead: Date?
    @Published private(set) var isReadingDTC = false
    @Published private(set) var log: [String] = []
    @Published private(set) var connectedName: String?

    // Portières (voir DoorMonitor.swift)
    @Published var doorConfig = DoorConfig.load() { didSet { doorConfig.save() } }
    @Published var doorStates: [Door: Bool] = [:]
    @Published var lastDoorRead: Date?
    var doorPollCounter = 0
    var scanToken = 0

    // MARK: - Bluetooth

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var wantsScan = false

    // MARK: - File de commandes ELM327

    struct Command {
        let text: String
        let timeout: TimeInterval
        let completion: (String?) -> Void
    }

    var queue: [Command] = []
    private var current: Command?
    private var buffer = ""
    private var timeoutWork: DispatchWorkItem?
    private var pollIndex = 0
    private var pollCount = 0
    var pollGeneration = 0
    var isCAN = true
    private var demoTimer: Timer?
    var demoTick: Double = 0

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    // MARK: - API publique

    func startScan() {
        guard !state.isLive else { return }
        devices = []
        wantsScan = true
        guard central.state == .poweredOn else { updateForCentralState(); return }
        state = .scanning
        // Les adaptateurs ELM327 BLE exposent des services variés (FFE0, FFF0, 18F0, E7810A71…) :
        // on scanne sans filtre puis on classe les appareils plausibles en tête.
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self, self.state == .scanning else { return }
            self.central.stopScan()
            self.state = .idle
        }
    }

    func stopScan() {
        wantsScan = false
        if central.isScanning { central.stopScan() }
        if state == .scanning { state = .idle }
    }

    func connect(_ device: Device) {
        stopScan()
        peripheral = device.peripheral
        peripheral?.delegate = self
        connectedName = device.name
        state = .connecting
        appendLog("→ Connexion à \(device.name)")
        central.connect(device.peripheral, options: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, self.state == .connecting else { return }
            self.disconnect()
            self.state = .failed("Délai de connexion dépassé")
        }
    }

    func disconnect() {
        pollGeneration += 1
        stopDemo()
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        resetSession()
        state = .idle
    }

    func startDemo() {
        disconnect()
        state = .demo
        connectedName = "Simulateur"
        protocolName = "ISO 15765-4 (CAN 11/500)"
        adapterVersion = "ELM327 v1.5 (simulé)"
        vin = "VF1RFB00X12345678"
        supportedPIDs = Set(OBDPID.allCases.map(\.rawValue))
        milOn = true
        storedDTCCount = 2
        demoTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.demoStep() }
    }

    func readDTCs() {
        if state == .demo {
            isReadingDTC = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                self.dtcs = [DTC(code: "P0420"), DTC(code: "P0171")]
                self.pendingDTCs = [DTC(code: "P0301")]
                self.lastDTCRead = Date()
                self.isReadingDTC = false
            }
            return
        }
        guard state == .connected else { return }
        isReadingDTC = true
        send("0101") { [weak self] r in self?.parseMonitorStatus(r) }
        send("03", timeout: 6) { [weak self] r in
            guard let self else { return }
            self.dtcs = self.parseDTCs(r, mode: "43")
        }
        send("07", timeout: 6) { [weak self] r in
            guard let self else { return }
            self.pendingDTCs = self.parseDTCs(r, mode: "47")
            self.lastDTCRead = Date()
            self.isReadingDTC = false
        }
    }

    /// Efface les codes défaut et éteint le voyant moteur (mode 04).
    func clearDTCs(completion: @escaping (Bool) -> Void) {
        if state == .demo {
            dtcs = []; pendingDTCs = []; milOn = false; storedDTCCount = 0
            completion(true); return
        }
        guard state == .connected else { completion(false); return }
        send("04", timeout: 8) { [weak self] r in
            let ok = r.map { $0.contains("44") } ?? false
            completion(ok)
            if ok { self?.readDTCs() }
        }
    }

    func sendRaw(_ text: String, completion: @escaping (String) -> Void) {
        guard state == .connected else { completion("Non connecté"); return }
        send(text.uppercased(), timeout: 6) { completion($0 ?? "Pas de réponse (délai dépassé)") }
    }

    // MARK: - Session

    private func resetSession() {
        timeoutWork?.cancel()
        queue = []
        current = nil
        buffer = ""
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        values = [:]
        supportedPIDs = []
        batteryVoltage = nil
        adapterVersion = nil
        protocolName = nil
        vin = nil
        milOn = nil
        storedDTCCount = nil
        connectedName = nil
        isReadingDTC = false
        doorStates = [:]
    }

    private func initializeAdapter() {
        state = .initializing
        let gen = pollGeneration
        send("ATZ", timeout: 5) { [weak self] r in
            self?.adapterVersion = r?.components(separatedBy: CharacterSet.newlines).first { $0.uppercased().contains("ELM") } ?? r
        }
        for cmd in ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"] {
            send(cmd) { _ in }
        }
        // 0100 déclenche la recherche automatique du protocole : peut prendre plusieurs secondes.
        send("0100", timeout: 15) { [weak self] r in
            guard let self, gen == self.pollGeneration else { return }
            guard let bytes = self.dataBytes(r, header: [0x41, 0x00]), bytes.count >= 4 else {
                self.state = .failed("Aucune réponse du véhicule. Contact mis ? Moteur démarré ?")
                return
            }
            self.addSupported(base: 0x00, bytes)
            self.send("ATDPN") { [weak self] r in
                guard let self, let r else { return }
                let n = r.replacingOccurrences(of: "A", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                self.isCAN = ["6", "7", "8", "9"].contains(n)
            }
            self.send("ATDP") { [weak self] r in
                self?.protocolName = r?.replacingOccurrences(of: "AUTO, ", with: "")
            }
            self.querySupported(base: 0x20, gen: gen)
        }
    }

    private func querySupported(base: UInt8, gen: Int) {
        // Le dernier bit du bloc précédent indique si le bloc suivant est supporté.
        guard base <= 0xA0, supportedPIDs.contains(base) else { finishInit(gen: gen); return }
        send(String(format: "01%02X", base)) { [weak self] r in
            guard let self, gen == self.pollGeneration else { return }
            if let bytes = self.dataBytes(r, header: [0x41, base]), bytes.count >= 4 {
                self.addSupported(base: base, bytes)
            }
            self.querySupported(base: base + 0x20, gen: gen)
        }
    }

    private func addSupported(base: UInt8, _ b: [UInt8]) {
        var set = supportedPIDs
        for i in 0..<32 {
            let byte = b[i / 8]
            if byte & (0x80 >> UInt8(i % 8)) != 0 { set.insert(base + UInt8(i + 1)) }
        }
        supportedPIDs = set
    }

    private func finishInit(gen: Int) {
        state = .connected
        appendLog("✓ \(supportedPIDs.count) PIDs supportés")
        send("0902", timeout: 6) { [weak self] r in self?.vin = self?.parseVIN(r) }
        readDTCs()
        poll(gen: gen)
    }

    private var pollList: [OBDPID] {
        OBDPID.allCases.filter { supportedPIDs.contains($0.rawValue) }
    }

    /// Boucle d'interrogation : les PIDs « rapides » (régime, vitesse…) sont lus plus souvent.
    func poll(gen: Int) {
        guard gen == pollGeneration, state == .connected else { return }
        let fast: [OBDPID] = [.rpm, .speed, .throttle, .engineLoad, .maf, .fuelRate].filter { supportedPIDs.contains($0.rawValue) }
        let slow = pollList.filter { !fast.contains($0) }
        var batch = fast
        if !slow.isEmpty {
            batch.append(slow[pollIndex % slow.count])
            pollIndex += 1
        }
        pollCount += 1
        if pollCount % 10 == 1 {
            send("ATRV") { [weak self] r in
                guard let r else { return }
                let v = Double(r.uppercased().replacingOccurrences(of: "V", with: "").trimmingCharacters(in: .whitespacesAndNewlines))
                if let v { self?.batteryVoltage = v }
            }
        }
        enqueueDoorPollIfNeeded()
        for pid in batch {
            send(pid.command) { [weak self] r in
                guard let self, let bytes = self.dataBytes(r, header: [0x41, pid.rawValue]), let v = pid.decode(bytes) else { return }
                self.values[pid] = v
            }
        }
        let marker = Command(text: "#POLL", timeout: 0) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self?.poll(gen: gen) }
        }
        queue.append(marker)
        sendNextIfIdle()
    }

    // MARK: - Envoi

    func send(_ text: String, timeout: TimeInterval = 3, completion: @escaping (String?) -> Void) {
        queue.append(Command(text: text, timeout: timeout, completion: completion))
        sendNextIfIdle()
    }

    private func sendNextIfIdle() {
        guard current == nil, !queue.isEmpty else { return }
        let cmd = queue.removeFirst()
        if cmd.text == "#POLL" { cmd.completion(nil); sendNextIfIdle(); return }
        guard let p = peripheral, let w = writeCharacteristic else {
            queue = []
            cmd.completion(nil)
            return
        }
        current = cmd
        buffer = ""
        let data = Data((cmd.text + "\r").utf8)
        let type: CBCharacteristicWriteType = w.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        p.writeValue(data, for: w, type: type)
        if log.count < 400, !cmd.text.hasPrefix("01") { appendLog("→ \(cmd.text)") }

        let work = DispatchWorkItem { [weak self] in
            guard let self, let c = self.current, c.text == cmd.text else { return }
            self.appendLog("⏱ \(cmd.text) sans réponse")
            self.current = nil
            c.completion(nil)
            self.sendNextIfIdle()
        }
        timeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + cmd.timeout, execute: work)
    }

    private func handleIncoming(_ data: Data) {
        guard let s = String(data: data, encoding: .ascii) ?? String(data: data, encoding: .utf8) else { return }
        buffer += s
        guard let promptRange = buffer.range(of: ">") else { return }
        let raw = String(buffer[..<promptRange.lowerBound])
        buffer = String(buffer[promptRange.upperBound...])
        timeoutWork?.cancel()
        let echo = current?.text ?? ""
        let response = raw
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { line in !line.isEmpty && line != echo && !line.hasPrefix("SEARCHING") }
            .joined(separator: "\n")
        guard let cmd = current else { return }
        current = nil
        if !cmd.text.hasPrefix("01") { appendLog("← \(response.replacingOccurrences(of: "\n", with: " | "))") }
        let failed = ["NO DATA", "UNABLE TO CONNECT", "CAN ERROR", "BUS INIT", "?", "STOPPED", "ERROR"].contains { response.uppercased().contains($0) } && !cmd.text.hasPrefix("AT")
        cmd.completion(failed ? nil : response)
        sendNextIfIdle()
    }

    // MARK: - Analyse des réponses

    /// Extrait les octets de données qui suivent l'en-tête donné (ex. 41 0C) dans la première ligne correspondante.
    private func dataBytes(_ response: String?, header: [UInt8]) -> [UInt8]? {
        guard let response else { return nil }
        let h = header.map { String(format: "%02X", $0) }.joined()
        for line in response.components(separatedBy: "\n") {
            var hex = line.uppercased().filter { $0.isHexDigit }
            if line.contains(":") { hex = String(line.split(separator: ":").last ?? "").uppercased().filter { $0.isHexDigit } }
            guard let r = hex.range(of: h) else { continue }
            return hexBytes(String(hex[r.upperBound...]))
        }
        return nil
    }

    func hexBytes(_ hex: String) -> [UInt8] {
        var out: [UInt8] = []
        var i = hex.startIndex
        while let j = hex.index(i, offsetBy: 2, limitedBy: hex.endIndex), i < hex.endIndex {
            if let b = UInt8(hex[i..<j], radix: 16) { out.append(b) }
            i = j
        }
        return out
    }

    /// Fusionne les trames multi-lignes (format CAN « 0: … 1: … ») en une seule chaîne hexadécimale.
    func joinedHex(_ response: String) -> String {
        response.components(separatedBy: "\n").compactMap { line -> String? in
            let l = line.uppercased().trimmingCharacters(in: .whitespaces)
            if l.contains(":") { return String(l.split(separator: ":").last ?? "").filter { $0.isHexDigit } }
            let hex = l.filter { $0.isHexDigit }
            if hex.count == 3 { return nil } // longueur de message ISO-TP
            return hex
        }.joined()
    }

    private func parseDTCs(_ response: String?, mode: String) -> [DTC] {
        guard let response else { return [] }
        var result: [DTC] = []
        if isCAN {
            let hex = joinedHex(response)
            var search = hex.startIndex
            while let r = hex.range(of: mode, range: search..<hex.endIndex) {
                let bytes = hexBytes(String(hex[r.upperBound...]))
                guard let count = bytes.first else { break }
                let codes = Array(bytes.dropFirst().prefix(Int(count) * 2))
                stride(from: 0, to: codes.count - 1, by: 2).forEach {
                    if let d = DTC.decode(codes[$0], codes[$0 + 1]) { result.append(d) }
                }
                // ECU suivant éventuel
                let consumed = 2 + 2 + codes.count * 2
                search = hex.index(r.lowerBound, offsetBy: consumed, limitedBy: hex.endIndex) ?? hex.endIndex
            }
        } else {
            for line in response.components(separatedBy: "\n") {
                let hex = line.uppercased().filter { $0.isHexDigit }
                guard hex.hasPrefix(mode) else { continue }
                let bytes = hexBytes(String(hex.dropFirst(2)))
                stride(from: 0, to: bytes.count - 1, by: 2).forEach {
                    if let d = DTC.decode(bytes[$0], bytes[$0 + 1]) { result.append(d) }
                }
            }
        }
        var seen = Set<String>()
        return result.filter { seen.insert($0.code).inserted }
    }

    private func parseMonitorStatus(_ response: String?) {
        guard let b = dataBytes(response, header: [0x41, 0x01]), let a = b.first else { return }
        milOn = a & 0x80 != 0
        storedDTCCount = Int(a & 0x7F)
    }

    private func parseVIN(_ response: String?) -> String? {
        guard let response else { return nil }
        let hex = joinedHex(response)
        let allowed = Set("ABCDEFGHJKLMNPRSTUVWXYZ0123456789")
        let chars = hexBytes(hex).compactMap { b -> Character? in
            let c = Character(UnicodeScalar(b))
            return allowed.contains(c) ? c : nil
        }
        guard chars.count >= 17 else { return nil }
        return String(chars.suffix(17))
    }

    // MARK: - Démo

    private func stopDemo() {
        demoTimer?.invalidate()
        demoTimer = nil
    }

    private func demoStep() {
        demoTick += 0.4
        let t = demoTick
        let rpm = 1800 + 1400 * sin(t / 3) + Double.random(in: -60...60)
        let speed = max(0, 70 + 45 * sin(t / 3 - 0.4))
        var v: [OBDPID: Double] = [:]
        v[.rpm] = max(750, rpm)
        v[.speed] = speed.rounded()
        v[.engineLoad] = 35 + 25 * sin(t / 3)
        v[.throttle] = 18 + 15 * sin(t / 3)
        v[.coolantTemp] = min(90, 40 + t * 1.5)
        v[.oilTemp] = min(98, 35 + t * 1.2)
        v[.intakeTemp] = 28
        v[.ambientTemp] = 17
        v[.maf] = 12 + 9 * sin(t / 3)
        v[.fuelRate] = 4.5 + 3 * sin(t / 3)
        v[.fuelLevel] = 62 - t * 0.01
        v[.moduleVoltage] = 14.1 + Double.random(in: -0.1...0.1)
        v[.intakePressure] = 45 + 30 * sin(t / 3)
        v[.baroPressure] = 101
        v[.timingAdvance] = 12 + 6 * sin(t / 2)
        v[.shortFuelTrim] = Double.random(in: -3...3)
        v[.longFuelTrim] = 2.3
        v[.fuelPressure] = 380
        v[.runTime] = t
        v[.distanceSinceCleared] = 1243
        v[.distanceWithMIL] = 87
        v[.odometer] = 84215.4 + speed * t / 3600
        values = v
        batteryVoltage = v[.moduleVoltage]
        demoDoors()
    }

    // MARK: - Utilitaires

    func appendLog(_ s: String) {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        log.append("\(f.string(from: Date()))  \(s)")
        if log.count > 500 { log.removeFirst(log.count - 500) }
    }

    private func updateForCentralState() {
        switch central.state {
        case .poweredOff: state = .bluetoothOff
        case .unauthorized: state = .unauthorized
        case .unsupported: state = .failed("Bluetooth LE non pris en charge")
        case .poweredOn:
            if state == .bluetoothOff || state == .unauthorized { state = .idle }
            if wantsScan && state == .idle { startScan() }
        default: break
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension OBDManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        updateForCentralState()
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        guard !name.isEmpty else { return }
        if let i = devices.firstIndex(where: { $0.id == peripheral.identifier }) {
            devices[i].rssi = RSSI.intValue
        } else {
            devices.append(Device(id: peripheral.identifier, name: name, rssi: RSSI.intValue, peripheral: peripheral))
        }
        devices.sort { ($0.likelyOBD ? 1 : 0, $0.rssi) > ($1.likelyOBD ? 1 : 0, $1.rssi) }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        appendLog("✓ Connecté, découverte des services…")
        state = .initializing
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        resetSession()
        state = .failed("Échec de connexion : \(error?.localizedDescription ?? "inconnu")")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard self.peripheral?.identifier == peripheral.identifier else { return }
        pollGeneration += 1
        resetSession()
        state = error == nil ? .idle : .failed("Adaptateur déconnecté")
    }
}

// MARK: - CBPeripheralDelegate

extension OBDManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for s in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: s)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        // Ignore les services standard (Device Information, Battery…)
        let ignored = ["180A", "180F", "1800", "1801"]
        guard !ignored.contains(service.uuid.uuidString) else { return }
        guard notifyCharacteristic == nil else { return }
        // On cherche un service qui offre à la fois une caractéristique « notify » (réception)
        // et une caractéristique « write » (émission) : c'est le port série de l'ELM327.
        let chars = service.characteristics ?? []
        let notify = chars.first { $0.properties.contains(.notify) || $0.properties.contains(.indicate) }
        let write = chars.first { $0.properties.contains(.writeWithoutResponse) && $0.uuid != notify?.uuid }
            ?? chars.first { $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse) }
        guard let notify, let write else { return }
        notifyCharacteristic = notify
        writeCharacteristic = write
        appendLog("Service \(service.uuid.uuidString) : RX \(notify.uuid.uuidString) / TX \(write.uuid.uuidString)")
        peripheral.setNotifyValue(true, for: notify)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.isNotifying, writeCharacteristic != nil, state == .initializing, current == nil, queue.isEmpty else { return }
        appendLog("✓ Canal série prêt (\(characteristic.uuid.uuidString))")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.initializeAdapter() }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        handleIncoming(data)
    }
}
