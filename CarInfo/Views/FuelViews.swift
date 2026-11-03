import SwiftUI
import Charts

struct FuelListView: View {
    @Binding var vehicle: Vehicle
    @State private var editing: FuelEntry?

    private var sorted: [FuelEntry] { vehicle.fuelLogs.sorted { $0.odometer > $1.odometer } }

    /// Consommation entre deux pleins complets successifs.
    private var consumptionPoints: [(Date, Double)] {
        let asc = vehicle.fuelLogs.sorted { $0.odometer < $1.odometer }
        var points: [(Date, Double)] = []
        var lastFull: FuelEntry?
        var litres = 0.0
        for e in asc {
            if lastFull != nil { litres += e.litres }
            if e.isFullTank {
                if let lf = lastFull, e.odometer > lf.odometer {
                    points.append((e.date, litres / Double(e.odometer - lf.odometer) * 100))
                }
                lastFull = e
                litres = 0
            }
        }
        return points
    }

    var body: some View {
        List {
            if vehicle.fuelLogs.isEmpty {
                ContentUnavailableView("Aucun plein", systemImage: "fuelpump",
                                       description: Text("Ajoutez vos pleins pour calculer automatiquement votre consommation réelle."))
            } else {
                Section("Statistiques") {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        StatTile(icon: "drop.fill", title: "Moyenne",
                                 value: vehicle.averageConsumption.map { String(format: "%.2f", $0) } ?? "—", unit: "L/100 km")
                        StatTile(icon: "eurosign.circle", title: "Total carburant", value: vehicle.totalFuelCost.euros)
                        StatTile(icon: "fuelpump", title: "Litres", value: String(format: "%.0f", vehicle.fuelLogs.reduce(0) { $0 + $1.litres }), unit: "L")
                        StatTile(icon: "tag", title: "Prix moyen",
                                 value: avgPrice.map { String(format: "%.3f", $0) } ?? "—", unit: "€/L")
                    }
                    .listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))

                    if consumptionPoints.count >= 2 {
                        Chart(consumptionPoints, id: \.0) { p in
                            LineMark(x: .value("Date", p.0), y: .value("L/100", p.1))
                                .interpolationMethod(.catmullRom)
                            PointMark(x: .value("Date", p.0), y: .value("L/100", p.1))
                        }
                        .chartYAxisLabel("L/100 km")
                        .frame(height: 180)
                        .padding(.vertical, 6)
                    }
                }

                Section("Historique") {
                    ForEach(sorted) { e in
                        Button { editing = e } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.date.formatted(date: .abbreviated, time: .omitted)).font(.headline)
                                    Text("\(e.odometer.km) · \(String(format: "%.2f", e.litres)) L à \(String(format: "%.3f", e.pricePerLitre)) €")
                                        .font(.caption).foregroundStyle(.secondary)
                                    if !e.isFullTank { Text("Plein partiel").font(.caption2).foregroundStyle(.orange) }
                                }
                                Spacer()
                                Text(e.totalPrice.euros).font(.subheadline.weight(.semibold))
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                    .onDelete { idx in
                        let ids = idx.map { sorted[$0].id }
                        vehicle.fuelLogs.removeAll { ids.contains($0.id) }
                    }
                }
            }
        }
        .navigationTitle("Carburant")
        .toolbar {
            Button {
                editing = FuelEntry(odometer: vehicle.mileage, pricePerLitre: sorted.first?.pricePerLitre ?? 0)
            } label: { Image(systemName: "plus") }
        }
        .sheet(item: $editing) { entry in
            FuelEditView(entry: entry) { saved in
                if let i = vehicle.fuelLogs.firstIndex(where: { $0.id == saved.id }) {
                    vehicle.fuelLogs[i] = saved
                } else {
                    vehicle.fuelLogs.append(saved)
                }
                if saved.odometer > vehicle.mileage { vehicle.mileage = saved.odometer }
            }
        }
    }

    private var avgPrice: Double? {
        let l = vehicle.fuelLogs.reduce(0) { $0 + $1.litres }
        return l > 0 ? vehicle.totalFuelCost / l : nil
    }
}

struct FuelEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State var entry: FuelEntry
    var onSave: (FuelEntry) -> Void

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $entry.date)
                HStack {
                    Text("Compteur")
                    TextField("0", value: $entry.odometer, format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    Text("km").foregroundStyle(.secondary)
                }
                HStack {
                    Text("Quantité")
                    TextField("0", value: $entry.litres, format: .number.precision(.fractionLength(0...2)))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    Text("L").foregroundStyle(.secondary)
                }
                HStack {
                    Text("Prix au litre")
                    TextField("0", value: $entry.pricePerLitre, format: .number.precision(.fractionLength(0...3)))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    Text("€").foregroundStyle(.secondary)
                }
                LabeledContent("Total", value: entry.totalPrice.euros)
                Toggle("Plein complet", isOn: $entry.isFullTank)
                TextField("Station", text: $entry.station)
            }
            .navigationTitle("Plein")
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
