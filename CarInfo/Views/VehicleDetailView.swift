import SwiftUI

struct VehicleDetailView: View {
    @EnvironmentObject var store: GarageStore
    @EnvironmentObject var obd: OBDManager
    let vehicleID: UUID
    @State private var showEdit = false

    var body: some View {
        if let binding = store.binding(for: vehicleID) {
            content(binding)
        } else {
            ContentUnavailableView("Véhicule supprimé", systemImage: "car.side")
        }
    }

    @ViewBuilder
    private func content(_ vehicle: Binding<Vehicle>) -> some View {
        let v = vehicle.wrappedValue
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(v.displayName).font(.title2.bold())
                            Text(v.subtitle).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: v.fuelType == .electrique ? "bolt.car.fill" : "car.side.fill")
                            .font(.largeTitle)
                            .foregroundStyle(Color.accentColor)
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        StatTile(icon: "road.lanes", title: "Kilométrage", value: v.mileage.formatted(), unit: "km")
                        StatTile(icon: "fuelpump.fill", title: "Conso. moyenne",
                                 value: v.averageConsumption.map { String(format: "%.1f", $0) } ?? "—", unit: "L/100")
                        StatTile(icon: "eurosign.circle.fill", title: "Dépenses totales", value: (v.totalFuelCost + v.totalMaintenanceCost).euros)
                        StatTile(icon: "chart.line.uptrend.xyaxis", title: "Coût au km",
                                 value: v.costPerKm.map { String(format: "%.2f €", $0) } ?? "—")
                    }
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
            }

            if obd.state.isLive {
                Section("Données OBD en direct") {
                    if let odo = obd.values[.odometer] {
                        Button {
                            vehicle.wrappedValue.mileage = Int(odo)
                        } label: {
                            Label("Mettre à jour le kilométrage (\(Int(odo).km))", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    if let vin = obd.vin, v.vin.isEmpty {
                        Button { vehicle.wrappedValue.vin = vin } label: {
                            Label("Associer le VIN lu : \(vin)", systemImage: "barcode")
                        }
                    }
                    if let mil = obd.milOn {
                        Label(mil ? "Voyant moteur allumé (\(obd.storedDTCCount ?? 0) code(s))" : "Voyant moteur éteint",
                              systemImage: mil ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(mil ? .orange : .green)
                    }
                    if let b = obd.batteryVoltage {
                        LabeledContent("Batterie", value: String(format: "%.1f V", b))
                    }
                }
            }

            Section("Échéances") {
                DeadlineRow(title: "Contrôle technique", icon: "checkmark.seal", date: v.technicalInspectionDate)
                DeadlineRow(title: "Assurance", icon: "shield.lefthalf.filled", date: v.insuranceExpiryDate)
                DeadlineRow(title: "Révision", icon: "wrench.and.screwdriver", date: v.nextServiceDate)
                if let next = v.nextServiceMileage {
                    let remaining = next - v.mileage
                    HStack {
                        Label("Révision au compteur", systemImage: "gauge.with.needle")
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text(next.km)
                            Text(remaining < 0 ? "Dépassée de \((-remaining).km)" : "Dans \(remaining.km)")
                                .font(.caption)
                                .foregroundStyle(remaining < 0 ? .red : remaining < 1000 ? .orange : .secondary)
                        }
                    }
                }
            }

            Section("Suivi") {
                NavigationLink {
                    MaintenanceListView(vehicle: vehicle)
                } label: {
                    LabeledContent {
                        Text("\(v.maintenance.count)")
                    } label: {
                        Label("Carnet d'entretien", systemImage: "book.closed.fill")
                    }
                }
                NavigationLink {
                    FuelListView(vehicle: vehicle)
                } label: {
                    LabeledContent {
                        Text("\(v.fuelLogs.count)")
                    } label: {
                        Label("Pleins & consommation", systemImage: "fuelpump.fill")
                    }
                }
                NavigationLink {
                    RecallsView(make: v.make, model: v.model, year: v.year)
                } label: {
                    Label("Rappels constructeur", systemImage: "exclamationmark.shield.fill")
                }
                .disabled(v.make.isEmpty || v.model.isEmpty)
            }

            Section("Caractéristiques") {
                LabeledContent("Marque", value: v.make.isEmpty ? "—" : v.make)
                LabeledContent("Modèle", value: v.model.isEmpty ? "—" : v.model)
                LabeledContent("Année", value: String(v.year))
                LabeledContent("Énergie", value: v.fuelType.rawValue)
                if !v.engine.isEmpty { LabeledContent("Motorisation", value: v.engine) }
                if !v.color.isEmpty { LabeledContent("Couleur", value: v.color) }
                if !v.plate.isEmpty { LabeledContent("Immatriculation", value: v.plate.uppercased()) }
                if !v.vin.isEmpty {
                    LabeledContent("VIN") {
                        Text(v.vin).font(.callout.monospaced()).textSelection(.enabled)
                    }
                }
                if !v.vinDetails.isEmpty {
                    NavigationLink("Fiche technique complète (\(v.vinDetails.count) champs)") {
                        VINDetailsList(details: v.vinDetails)
                            .navigationTitle("Fiche technique")
                    }
                }
            }

            if !v.notes.isEmpty {
                Section("Notes") { Text(v.notes) }
            }
        }
        .navigationTitle(v.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("Modifier") { showEdit = true }
        }
        .sheet(isPresented: $showEdit) {
            VehicleEditView(vehicle: v, isNew: false) { vehicle.wrappedValue = $0 }
        }
    }
}

struct VINDetailsList: View {
    let details: [String: String]
    var body: some View {
        List { VINDetailRows(details: details) }
    }
}

struct VINDetailRows: View {
    let details: [String: String]

    private var rows: [(String, String)] {
        details.map { (NHTSAService.fieldLabels[$0.key] ?? prettify($0.key), $0.value) }
            .sorted { lhs, rhs in
                let l = NHTSAService.fieldLabels.values.contains(lhs.0)
                let r = NHTSAService.fieldLabels.values.contains(rhs.0)
                return l != r ? l : lhs.0 < rhs.0
            }
    }

    var body: some View {
        ForEach(rows, id: \.0) { row in
            LabeledContent(row.0) {
                Text(row.1).multilineTextAlignment(.trailing).textSelection(.enabled)
            }
        }
    }

    private func prettify(_ key: String) -> String {
        var out = ""
        for c in key {
            if c.isUppercase, let last = out.last, last.isLowercase { out.append(" ") }
            out.append(c)
        }
        return out
    }
}
