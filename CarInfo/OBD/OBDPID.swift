import Foundation

/// PIDs OBD-II mode 01 pris en charge par l'application.
enum OBDPID: UInt8, CaseIterable, Identifiable {
    case engineLoad = 0x04
    case coolantTemp = 0x05
    case shortFuelTrim = 0x06
    case longFuelTrim = 0x07
    case fuelPressure = 0x0A
    case intakePressure = 0x0B
    case rpm = 0x0C
    case speed = 0x0D
    case timingAdvance = 0x0E
    case intakeTemp = 0x0F
    case maf = 0x10
    case throttle = 0x11
    case runTime = 0x1F
    case distanceWithMIL = 0x21
    case fuelLevel = 0x2F
    case distanceSinceCleared = 0x31
    case baroPressure = 0x33
    case moduleVoltage = 0x42
    case ambientTemp = 0x46
    case oilTemp = 0x5C
    case fuelRate = 0x5E
    case odometer = 0xA6

    var id: UInt8 { rawValue }
    var command: String { String(format: "01%02X", rawValue) }

    var name: String {
        switch self {
        case .engineLoad: return "Charge moteur"
        case .coolantTemp: return "Liquide de refroidissement"
        case .shortFuelTrim: return "Correction carburant CT"
        case .longFuelTrim: return "Correction carburant LT"
        case .fuelPressure: return "Pression carburant"
        case .intakePressure: return "Pression admission"
        case .rpm: return "Régime moteur"
        case .speed: return "Vitesse"
        case .timingAdvance: return "Avance allumage"
        case .intakeTemp: return "Température admission"
        case .maf: return "Débit d'air (MAF)"
        case .throttle: return "Papillon"
        case .runTime: return "Temps depuis démarrage"
        case .distanceWithMIL: return "Distance voyant allumé"
        case .fuelLevel: return "Niveau carburant"
        case .distanceSinceCleared: return "Distance depuis effacement"
        case .baroPressure: return "Pression atmosphérique"
        case .moduleVoltage: return "Tension calculateur"
        case .ambientTemp: return "Température extérieure"
        case .oilTemp: return "Température d'huile"
        case .fuelRate: return "Consommation instantanée"
        case .odometer: return "Compteur kilométrique"
        }
    }

    var unit: String {
        switch self {
        case .engineLoad, .throttle, .fuelLevel, .shortFuelTrim, .longFuelTrim: return "%"
        case .coolantTemp, .intakeTemp, .ambientTemp, .oilTemp: return "°C"
        case .fuelPressure, .intakePressure, .baroPressure: return "kPa"
        case .rpm: return "tr/min"
        case .speed: return "km/h"
        case .timingAdvance: return "°"
        case .maf: return "g/s"
        case .runTime: return "s"
        case .distanceWithMIL, .distanceSinceCleared, .odometer: return "km"
        case .moduleVoltage: return "V"
        case .fuelRate: return "L/h"
        }
    }

    var icon: String {
        switch self {
        case .engineLoad: return "engine.combustion.fill"
        case .coolantTemp: return "thermometer.medium"
        case .shortFuelTrim, .longFuelTrim: return "slider.horizontal.3"
        case .fuelPressure, .intakePressure, .baroPressure: return "gauge.with.needle"
        case .rpm: return "gauge.with.dots.needle.67percent"
        case .speed: return "speedometer"
        case .timingAdvance: return "bolt.fill"
        case .intakeTemp: return "wind"
        case .maf: return "wind"
        case .throttle: return "pedal.accelerator.fill"
        case .runTime: return "timer"
        case .distanceWithMIL: return "exclamationmark.triangle.fill"
        case .fuelLevel: return "fuelpump.fill"
        case .distanceSinceCleared: return "road.lanes"
        case .moduleVoltage: return "bolt.batteryblock.fill"
        case .ambientTemp: return "sun.max.fill"
        case .oilTemp: return "oilcan.fill"
        case .fuelRate: return "drop.fill"
        case .odometer: return "car.side.fill"
        }
    }

    var decimals: Int {
        switch self {
        case .moduleVoltage, .maf, .fuelRate: return 1
        case .odometer: return 1
        default: return 0
        }
    }

    /// Nombre d'octets de données attendus.
    var byteCount: Int {
        switch self {
        case .rpm, .maf, .runTime, .distanceWithMIL, .distanceSinceCleared, .moduleVoltage, .fuelRate: return 2
        case .odometer: return 4
        default: return 1
        }
    }

    func decode(_ b: [UInt8]) -> Double? {
        guard b.count >= byteCount else { return nil }
        let A = Double(b[0])
        let B = b.count > 1 ? Double(b[1]) : 0
        switch self {
        case .engineLoad, .throttle, .fuelLevel: return A * 100 / 255
        case .coolantTemp, .intakeTemp, .ambientTemp, .oilTemp: return A - 40
        case .shortFuelTrim, .longFuelTrim: return (A - 128) * 100 / 128
        case .fuelPressure: return A * 3
        case .intakePressure, .baroPressure, .speed: return A
        case .rpm: return (256 * A + B) / 4
        case .timingAdvance: return A / 2 - 64
        case .maf: return (256 * A + B) / 100
        case .runTime, .distanceWithMIL, .distanceSinceCleared: return 256 * A + B
        case .moduleVoltage: return (256 * A + B) / 1000
        case .fuelRate: return (256 * A + B) / 20
        case .odometer:
            let v = (UInt32(b[0]) << 24) | (UInt32(b[1]) << 16) | (UInt32(b[2]) << 8) | UInt32(b[3])
            return Double(v) / 10
        }
    }

    func format(_ v: Double) -> String {
        if self == .runTime {
            let s = Int(v)
            return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
        }
        return String(format: "%.\(decimals)f", v)
    }

    /// Plage de valeurs typique (pour les jauges).
    var range: ClosedRange<Double> {
        switch self {
        case .rpm: return 0...7000
        case .speed: return 0...220
        case .coolantTemp, .oilTemp: return -20...130
        case .intakeTemp, .ambientTemp: return -20...60
        case .moduleVoltage: return 10...16
        case .shortFuelTrim, .longFuelTrim: return -25...25
        case .fuelPressure: return 0...765
        case .intakePressure, .baroPressure: return 0...255
        case .maf: return 0...200
        case .fuelRate: return 0...30
        default: return 0...100
        }
    }
}

struct DTC: Identifiable, Hashable {
    let code: String
    var id: String { code }
    var description: String { DTCDatabase.describe(code) }

    var system: String {
        switch code.first {
        case "P": return "Groupe motopropulseur"
        case "C": return "Châssis"
        case "B": return "Carrosserie"
        case "U": return "Réseau / communication"
        default: return "Inconnu"
        }
    }

    static func decode(_ a: UInt8, _ b: UInt8) -> DTC? {
        guard a != 0 || b != 0 else { return nil }
        let letters: [Character] = ["P", "C", "B", "U"]
        let code = String(letters[Int(a >> 6)]) + String(format: "%X%X%02X", (a >> 4) & 0x3, a & 0xF, b)
        return DTC(code: code)
    }
}
