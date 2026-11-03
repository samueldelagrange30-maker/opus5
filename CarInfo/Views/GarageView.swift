import SwiftUI

struct GarageView: View {
    @EnvironmentObject var store: GarageStore
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            Group {
                if store.vehicles.isEmpty {
                    ContentUnavailableView {
                        Label("Aucun véhicule", systemImage: "car.side")
                    } description: {
                        Text("Ajoutez votre voiture pour suivre ses caractéristiques, son entretien, sa consommation et ses diagnostics.")
                    } actions: {
                        Button("Ajouter un véhicule") { showAdd = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        ForEach(store.vehicles) { v in
                            NavigationLink(value: v.id) { VehicleRow(vehicle: v, selected: store.selectedVehicleID == v.id) }
                                .swipeActions(edge: .leading) {
                                    Button { store.selectedVehicleID = v.id } label: { Label("Principal", systemImage: "star.fill") }
                                        .tint(.yellow)
                                }
                        }
                        .onDelete(perform: store.delete)
                    }
                }
            }
            .navigationTitle("Mon garage")
            .navigationDestination(for: UUID.self) { id in
                VehicleDetailView(vehicleID: id)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
                if let url = store.exportURL(), !store.vehicles.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                VehicleEditView(vehicle: Vehicle(), isNew: true) { store.add($0) }
            }
        }
    }
}

struct VehicleRow: View {
    let vehicle: Vehicle
    var selected = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.gradient)
                Image(systemName: vehicle.fuelType == .electrique ? "bolt.car.fill" : "car.fill")
                    .foregroundStyle(.white)
                    .font(.title3)
            }
            .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(vehicle.displayName).font(.headline)
                    if selected { Image(systemName: "star.fill").font(.caption).foregroundStyle(.yellow) }
                }
                Text(vehicle.subtitle).font(.subheadline).foregroundStyle(.secondary)
                Text(vehicle.mileage.km).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
