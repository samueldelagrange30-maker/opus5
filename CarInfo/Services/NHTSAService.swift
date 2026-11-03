import Foundation

/// Accès aux API publiques et gratuites de la NHTSA (décodage VIN + rappels).
enum NHTSAService {
    struct DecodedVIN {
        var make = ""
        var model = ""
        var year: Int?
        var engine = ""
        var fuel = ""
        var all: [String: String] = [:]
        var errorText: String?
    }

    struct Recall: Identifiable, Decodable, Hashable {
        var id: String { NHTSACampaignNumber + Component }
        let NHTSACampaignNumber: String
        let Component: String
        let Summary: String
        let Consequence: String?
        let Remedy: String?
        let ReportReceivedDate: String?
        let Manufacturer: String?
    }

    private struct VPICResponse: Decodable {
        let Results: [[String: String?]]
    }

    private struct RecallResponse: Decodable {
        let results: [Recall]?
    }

    enum ServiceError: LocalizedError {
        case invalidVIN, badResponse
        var errorDescription: String? {
            switch self {
            case .invalidVIN: return "Le VIN doit comporter 17 caractères (sans I, O ni Q)."
            case .badResponse: return "Réponse inattendue du serveur."
            }
        }
    }

    static func isValidVIN(_ vin: String) -> Bool {
        let v = vin.uppercased()
        guard v.count == 17 else { return false }
        let allowed = Set("ABCDEFGHJKLMNPRSTUVWXYZ0123456789")
        return v.allSatisfy { allowed.contains($0) }
    }

    static func decode(vin raw: String) async throws -> DecodedVIN {
        let vin = raw.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard isValidVIN(vin) else { throw ServiceError.invalidVIN }
        let url = URL(string: "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/\(vin)?format=json")!
        let (data, _) = try await URLSession.shared.data(from: url)
        let resp = try JSONDecoder().decode(VPICResponse.self, from: data)
        guard let first = resp.Results.first else { throw ServiceError.badResponse }

        var all: [String: String] = [:]
        for (k, v) in first {
            guard let v, !v.isEmpty, v != "Not Applicable", v != "0" else { continue }
            if ["ErrorCode", "ErrorText", "AdditionalErrorText", "SuggestedVIN", "PossibleValues", "VehicleDescriptor"].contains(k) { continue }
            all[k] = v
        }
        var out = DecodedVIN()
        out.all = all
        out.make = (first["Make"] ?? nil)?.capitalized ?? ""
        out.model = (first["Model"] ?? nil) ?? ""
        out.year = Int((first["ModelYear"] ?? nil) ?? "")
        out.fuel = (first["FuelTypePrimary"] ?? nil) ?? ""
        let disp = (first["DisplacementL"] ?? nil).flatMap { Double($0) }.map { String(format: "%.1f L", $0) } ?? ""
        let cyl = (first["EngineCylinders"] ?? nil).map { "\($0) cyl." } ?? ""
        let hp = (first["EngineHP"] ?? nil).map { "\($0) ch" } ?? ""
        out.engine = [disp, cyl, hp].filter { !$0.isEmpty }.joined(separator: " · ")
        if let code = first["ErrorCode"] ?? nil, !code.hasPrefix("0") {
            out.errorText = (first["ErrorText"] ?? nil)
        }
        return out
    }

    static func recalls(make: String, model: String, year: Int) async throws -> [Recall] {
        var c = URLComponents(string: "https://api.nhtsa.gov/recalls/recallsByVehicle")!
        c.queryItems = [
            .init(name: "make", value: make),
            .init(name: "model", value: model),
            .init(name: "modelYear", value: String(year)),
        ]
        let (data, _) = try await URLSession.shared.data(from: c.url!)
        return try JSONDecoder().decode(RecallResponse.self, from: data).results ?? []
    }

    /// Libellés français pour les champs vPIC les plus courants.
    static let fieldLabels: [String: String] = [
        "Make": "Marque", "Model": "Modèle", "ModelYear": "Année modèle", "Trim": "Finition",
        "Series": "Série", "BodyClass": "Carrosserie", "Doors": "Portes", "Seats": "Places",
        "VehicleType": "Type de véhicule", "Manufacturer": "Constructeur",
        "PlantCountry": "Pays d'assemblage", "PlantCity": "Ville d'assemblage", "PlantCompanyName": "Usine",
        "DisplacementL": "Cylindrée (L)", "DisplacementCC": "Cylindrée (cm³)", "EngineCylinders": "Cylindres",
        "EngineHP": "Puissance (ch)", "EngineKW": "Puissance (kW)", "EngineModel": "Code moteur",
        "EngineConfiguration": "Architecture moteur", "FuelTypePrimary": "Carburant principal",
        "FuelTypeSecondary": "Carburant secondaire", "FuelInjectionType": "Injection",
        "Turbo": "Turbo", "ValveTrainDesign": "Distribution", "TransmissionStyle": "Boîte de vitesses",
        "TransmissionSpeeds": "Rapports", "DriveType": "Transmission", "GVWR": "PTAC",
        "ElectrificationLevel": "Électrification", "BatteryKWh": "Batterie (kWh)", "ChargerLevel": "Recharge",
        "ABS": "ABS", "ESC": "ESP", "TPMS": "Capteurs de pression pneus", "AirBagLocFront": "Airbags avant",
        "AirBagLocSide": "Airbags latéraux", "AirBagLocCurtain": "Airbags rideaux", "AirBagLocKnee": "Airbags genoux",
        "SeatBeltsAll": "Ceintures", "AdaptiveCruiseControl": "Régulateur adaptatif",
        "ForwardCollisionWarning": "Alerte collision", "LaneDepartureWarning": "Alerte franchissement de ligne",
        "LaneKeepSystem": "Maintien de voie", "BlindSpotMon": "Angle mort", "RearVisibilitySystem": "Caméra de recul",
        "ParkAssist": "Aide au stationnement", "KeylessIgnition": "Démarrage sans clé",
        "DaytimeRunningLight": "Feux de jour", "SteeringLocation": "Position du volant",
        "WheelBaseShort": "Empattement (pouces)", "WheelSizeFront": "Jantes avant (pouces)",
        "WheelSizeRear": "Jantes arrière (pouces)", "EntertainmentSystem": "Multimédia",
        "BasePrice": "Prix de base ($)", "WMI": "Code constructeur (WMI)", "VIN": "VIN",
    ]
}
