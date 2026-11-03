import SwiftUI

struct VehicleEditView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var obd: OBDManager
    @State var vehicle: Vehicle
    var isNew: Bool
    var onSave: (Vehicle) -> Void

    @State private var decoding = false
    @State private var decodeError: String?
    @State private var hasCT = false
    @State private var hasInsurance = false
    @State private var hasServiceDate = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("VIN (17 caractères)", text: $vehicle.vin)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(.body.monospaced())
                        if decoding { ProgressView() } else {
                            Button("Décoder") { Task { await decode() } }
                                .disabled(!NHTSAService.isValidVIN(vehicle.vin))
                        }
                    }
                    if let vin = obd.vin, vin != vehicle.vin {
                        Button {
                            vehicle.vin = vin
                            Task { await decode() }
                        } label: {
                            Label("Utiliser le VIN lu par l'OBD : \(vin)", systemImage: "antenna.radiowaves.left.and.right")
                        }
                    }
                    if let decodeError { Text(decodeError).font(.caption).foregroundStyle(.red) }
                } header: {
                    Text("Identification")
                } footer: {
                    Text("Le VIN figure sur la carte grise (case E), en bas du pare-brise ou sur le montant de porte. Le décodage remplit automatiquement les champs.")
                }

                Section("Véhicule") {
                    TextField("Surnom (facultatif)", text: $vehicle.nickname)
                    TextField("Marque", text: $vehicle.make)
                    TextField("Modèle", text: $vehicle.model)
                    Stepper("Année : \(String(vehicle.year))", value: $vehicle.year, in: 1950...2030)
                    TextField("Immatriculation", text: $vehicle.plate)
                        .textInputAutocapitalization(.characters)
                    Picker("Énergie", selection: $vehicle.fuelType) {
                        ForEach(FuelType.allCases) { Text($0.rawValue).tag($0) }
                    }
                    TextField("Motorisation", text: $vehicle.engine)
                    TextField("Couleur", text: $vehicle.color)
                    HStack {
                        Text("Kilométrage")
                        TextField("0", value: $vehicle.mileage, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text("km").foregroundStyle(.secondary)
                    }
                }

                Section("Échéances") {
                    Toggle("Contrôle technique", isOn: $hasCT)
                    if hasCT {
                        DatePicker("Prochain CT", selection: Binding(get: { vehicle.technicalInspectionDate ?? Date() }, set: { vehicle.technicalInspectionDate = $0 }), displayedComponents: .date)
                    }
                    Toggle("Assurance", isOn: $hasInsurance)
                    if hasInsurance {
                        DatePicker("Échéance assurance", selection: Binding(get: { vehicle.insuranceExpiryDate ?? Date() }, set: { vehicle.insuranceExpiryDate = $0 }), displayedComponents: .date)
                    }
                    Toggle("Date de révision", isOn: $hasServiceDate)
                    if hasServiceDate {
                        DatePicker("Prochaine révision", selection: Binding(get: { vehicle.nextServiceDate ?? Date() }, set: { vehicle.nextServiceDate = $0 }), displayedComponents: .date)
                    }
                    HStack {
                        Text("Révision à")
                        TextField("km", value: Binding(get: { vehicle.nextServiceMileage ?? 0 }, set: { vehicle.nextServiceMileage = $0 > 0 ? $0 : nil }), format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text("km").foregroundStyle(.secondary)
                    }
                }

                Section("Notes") {
                    TextField("Notes", text: $vehicle.notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle(isNew ? "Nouveau véhicule" : "Modifier")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        if !hasCT { vehicle.technicalInspectionDate = nil }
                        else if vehicle.technicalInspectionDate == nil { vehicle.technicalInspectionDate = Date() }
                        if !hasInsurance { vehicle.insuranceExpiryDate = nil }
                        else if vehicle.insuranceExpiryDate == nil { vehicle.insuranceExpiryDate = Date() }
                        if !hasServiceDate { vehicle.nextServiceDate = nil }
                        else if vehicle.nextServiceDate == nil { vehicle.nextServiceDate = Date() }
                        vehicle.vin = vehicle.vin.uppercased().trimmingCharacters(in: .whitespaces)
                        onSave(vehicle)
                        dismiss()
                    }
                    .bold()
                }
            }
            .onAppear {
                hasCT = vehicle.technicalInspectionDate != nil
                hasInsurance = vehicle.insuranceExpiryDate != nil
                hasServiceDate = vehicle.nextServiceDate != nil
            }
        }
    }

    private func decode() async {
        decoding = true
        decodeError = nil
        defer { decoding = false }
        do {
            let d = try await NHTSAService.decode(vin: vehicle.vin)
            if !d.make.isEmpty { vehicle.make = d.make }
            if !d.model.isEmpty { vehicle.model = d.model }
            if let y = d.year { vehicle.year = y }
            if !d.engine.isEmpty { vehicle.engine = d.engine }
            let f = d.fuel.lowercased()
            if f.contains("diesel") { vehicle.fuelType = .diesel }
            else if f.contains("electric") { vehicle.fuelType = .electrique }
            else if f.contains("gasoline") { vehicle.fuelType = .essence }
            vehicle.vinDetails = d.all
            if d.make.isEmpty { decodeError = d.errorText ?? "VIN non reconnu par la base NHTSA." }
        } catch {
            decodeError = error.localizedDescription
        }
    }
}
