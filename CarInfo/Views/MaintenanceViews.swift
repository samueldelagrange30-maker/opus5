import SwiftUI

struct MaintenanceListView: View {
    @Binding var vehicle: Vehicle
    @State private var editing: MaintenanceEntry?

    private var sorted: [MaintenanceEntry] { vehicle.maintenance.sorted { $0.date > $1.date } }

    var body: some View {
        List {
            if vehicle.maintenance.isEmpty {
                ContentUnavailableView("Carnet vide", systemImage: "book.closed",
                                       description: Text("Enregistrez vos vidanges, révisions, pneus, freins…"))
            } else {
                Section {
                    LabeledContent("Interventions", value: "\(vehicle.maintenance.count)")
                    LabeledContent("Total dépensé", value: vehicle.totalMaintenanceCost.euros)
                    ForEach(lastByKind, id: \.0) { item in
                        LabeledContent("Dernier(e) \(item.0.rawValue.lowercased())") {
                            Text("\(item.1.date.formatted(date: .abbreviated, time: .omitted)) · \(item.1.mileage.km)")
                        }
                    }
                } header: { Text("Résumé") }

                Section("Historique") {
                    ForEach(sorted) { e in
                        Button { editing = e } label: { MaintenanceRow(entry: e) }
                            .foregroundStyle(.primary)
                    }
                    .onDelete { idx in
                        let ids = idx.map { sorted[$0].id }
                        vehicle.maintenance.removeAll { ids.contains($0.id) }
                    }
                }
            }
        }
        .navigationTitle("Carnet d'entretien")
        .toolbar {
            Button {
                editing = MaintenanceEntry(mileage: vehicle.mileage)
            } label: { Image(systemName: "plus") }
        }
        .sheet(item: $editing) { entry in
            MaintenanceEditView(entry: entry) { saved in
                if let i = vehicle.maintenance.firstIndex(where: { $0.id == saved.id }) {
                    vehicle.maintenance[i] = saved
                } else {
                    vehicle.maintenance.append(saved)
                }
                if saved.mileage > vehicle.mileage { vehicle.mileage = saved.mileage }
            }
        }
    }

    private var lastByKind: [(MaintenanceKind, MaintenanceEntry)] {
        [MaintenanceKind.vidange, .revision, .pneus, .freins, .distribution].compactMap { k in
            sorted.first { $0.kind == k }.map { (k, $0) }
        }
    }
}

struct MaintenanceRow: View {
    let entry: MaintenanceEntry
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: entry.kind.icon)
                .frame(width: 32, height: 32)
                .background(Color.accentColor.opacity(0.15), in: Circle())
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.kind.rawValue).font(.headline)
                Text("\(entry.date.formatted(date: .abbreviated, time: .omitted)) · \(entry.mileage.km)")
                    .font(.caption).foregroundStyle(.secondary)
                if !entry.garage.isEmpty { Text(entry.garage).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(entry.cost.euros).font(.subheadline.weight(.semibold))
        }
    }
}

struct MaintenanceEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State var entry: MaintenanceEntry
    var onSave: (MaintenanceEntry) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $entry.kind) {
                    ForEach(MaintenanceKind.allCases) { Label($0.rawValue, systemImage: $0.icon).tag($0) }
                }
                DatePicker("Date", selection: $entry.date, displayedComponents: .date)
                HStack {
                    Text("Kilométrage")
                    TextField("0", value: $entry.mileage, format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    Text("km").foregroundStyle(.secondary)
                }
                HStack {
                    Text("Coût")
                    TextField("0", value: $entry.cost, format: .number.precision(.fractionLength(0...2)))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    Text("€").foregroundStyle(.secondary)
                }
                TextField("Garage", text: $entry.garage)
                TextField("Détails (pièces, références…)", text: $entry.notes, axis: .vertical)
                    .lineLimit(2...6)
            }
            .navigationTitle("Intervention")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { onSave(entry); dismiss() }.bold()
                }
            }
        }
    }
}
