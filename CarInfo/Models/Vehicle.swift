import Foundation

enum FuelType: String, Codable, CaseIterable, Identifiable {
    case essence = "Essence"
    case diesel = "Diesel"
    case hybride = "Hybride"
    case electrique = "Électrique"
    case gpl = "GPL"
    case e85 = "E85"
    var id: String { rawValue }
}

struct Vehicle: Identifiable, Codable, Hashable {
    var id = UUID()
    var nickname: String = ""
    var make: String = ""
    var model: String = ""
    var year: Int = Calendar.current.component(.year, from: Date())
    var vin: String = ""
    var plate: String = ""
    var fuelType: FuelType = .essence
    var mileage: Int = 0
    var engine: String = ""
    var color: String = ""

    // Échéances
    var technicalInspectionDate: Date?
    var insuranceExpiryDate: Date?
    var nextServiceMileage: Int?
    var nextServiceDate: Date?

    var maintenance: [MaintenanceEntry] = []
    var fuelLogs: [FuelEntry] = []
    /// Résultat brut du décodage VIN (NHTSA vPIC)
    var vinDetails: [String: String] = [:]
    var notes: String = ""

    var displayName: String {
        if !nickname.isEmpty { return nickname }
        let s = "\(make) \(model)".trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? "Mon véhicule" : s
    }

    var subtitle: String {
        var parts: [String] = []
        if !nickname.isEmpty, !(make.isEmpty && model.isEmpty) { parts.append("\(make) \(model)") }
        parts.append(String(year))
        if !plate.isEmpty { parts.append(plate.uppercased()) }
        return parts.joined(separator: " · ")
    }

    var totalMaintenanceCost: Double { maintenance.reduce(0) { $0 + $1.cost } }
    var totalFuelCost: Double { fuelLogs.reduce(0) { $0 + $1.totalPrice } }

    /// Consommation moyenne (L/100 km) calculée sur les pleins complets.
    var averageConsumption: Double? {
        let full = fuelLogs.filter { $0.isFullTank }.sorted { $0.odometer < $1.odometer }
        guard let first = full.first, let last = full.last, last.odometer > first.odometer else { return nil }
        let litres = fuelLogs
            .filter { $0.odometer > first.odometer && $0.odometer <= last.odometer }
            .reduce(0) { $0 + $1.litres }
        let km = Double(last.odometer - first.odometer)
        return km > 0 ? litres / km * 100 : nil
    }

    var costPerKm: Double? {
        let odos = (fuelLogs.map(\.odometer) + maintenance.map(\.mileage)).filter { $0 > 0 }
        guard let mn = odos.min(), let mx = odos.max(), mx > mn else { return nil }
        return (totalFuelCost + totalMaintenanceCost) / Double(mx - mn)
    }
}

enum MaintenanceKind: String, Codable, CaseIterable, Identifiable {
    case vidange = "Vidange"
    case filtres = "Filtres"
    case freins = "Freins"
    case pneus = "Pneus"
    case distribution = "Distribution"
    case batterie = "Batterie"
    case controleTechnique = "Contrôle technique"
    case revision = "Révision"
    case climatisation = "Climatisation"
    case carrosserie = "Carrosserie"
    case autre = "Autre"
    var id: String { rawValue }

    var icon: String {
        switch self {
        case .vidange: return "drop.fill"
        case .filtres: return "aqi.medium"
        case .freins: return "exclamationmark.brakesignal"
        case .pneus: return "circle.circle"
        case .distribution: return "gearshape.2.fill"
        case .batterie: return "minus.plus.batteryblock.fill"
        case .controleTechnique: return "checkmark.seal.fill"
        case .revision: return "wrench.and.screwdriver.fill"
        case .climatisation: return "snowflake"
        case .carrosserie: return "car.side.fill"
        case .autre: return "ellipsis.circle.fill"
        }
    }
}

struct MaintenanceEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    var date = Date()
    var kind: MaintenanceKind = .vidange
    var mileage: Int = 0
    var cost: Double = 0
    var garage: String = ""
    var notes: String = ""
}

struct FuelEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    var date = Date()
    var odometer: Int = 0
    var litres: Double = 0
    var pricePerLitre: Double = 0
    var isFullTank = true
    var station: String = ""

    var totalPrice: Double { litres * pricePerLitre }
}
