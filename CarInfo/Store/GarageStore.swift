import Foundation
import SwiftUI

final class GarageStore: ObservableObject {
    @Published var vehicles: [Vehicle] = [] {
        didSet { save() }
    }
    @AppStorage("selectedVehicleID") private var selectedIDString: String = ""

    private let url: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("garage.json")
    }()

    init() {
        load()
        if vehicles.isEmpty && !UserDefaults.standard.bool(forKey: "didCreateDefaultVehicle") {
            // Premier lancement : la Dacia Sandero III de l'utilisateur est préenregistrée.
            UserDefaults.standard.set(true, forKey: "didCreateDefaultVehicle")
            add(Vehicle(nickname: "Sandero III", make: "Dacia", model: "Sandero", year: 2026))
        }
    }

    var selectedVehicleID: UUID? {
        get { UUID(uuidString: selectedIDString) ?? vehicles.first?.id }
        set { selectedIDString = newValue?.uuidString ?? ""; objectWillChange.send() }
    }

    var selectedVehicle: Vehicle? {
        guard let id = selectedVehicleID else { return nil }
        return vehicles.first { $0.id == id }
    }

    func binding(for id: UUID) -> Binding<Vehicle>? {
        guard vehicles.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: { [weak self] in self?.vehicles.first { $0.id == id } ?? Vehicle() },
            set: { [weak self] newValue in
                guard let self, let i = self.vehicles.firstIndex(where: { $0.id == id }) else { return }
                self.vehicles[i] = newValue
            }
        )
    }

    func add(_ v: Vehicle) {
        vehicles.append(v)
        if vehicles.count == 1 { selectedVehicleID = v.id }
    }

    func delete(at offsets: IndexSet) {
        vehicles.remove(atOffsets: offsets)
    }

    func update(_ id: UUID, _ change: (inout Vehicle) -> Void) {
        guard let i = vehicles.firstIndex(where: { $0.id == id }) else { return }
        change(&vehicles[i])
    }

    private func load() {
        guard let data = try? Data(contentsOf: url) else { return }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        if let v = try? dec.decode([Vehicle].self, from: data) { vehicles = v }
    }

    private func save() {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.prettyPrinted]
        if let data = try? enc.encode(vehicles) {
            try? data.write(to: url, options: .atomic)
        }
    }

    /// Exporte le garage complet en JSON (partage / sauvegarde).
    func exportURL() -> URL? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("MonAuto-sauvegarde.json")
        try? FileManager.default.removeItem(at: tmp)
        try? FileManager.default.copyItem(at: url, to: tmp)
        return FileManager.default.fileExists(atPath: tmp.path) ? tmp : nil
    }
}
