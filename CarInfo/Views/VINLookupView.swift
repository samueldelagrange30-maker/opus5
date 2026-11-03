import SwiftUI

struct VINLookupView: View {
    @EnvironmentObject var store: GarageStore
    @EnvironmentObject var obd: OBDManager
    @State private var vin = ""
    @State private var result: NHTSAService.DecodedVIN?
    @State private var loading = false
    @State private var error: String?
    @State private var added = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Saisissez un VIN", text: $vin)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.title3.monospaced())
                        .onSubmit { Task { await decode() } }
                    HStack {
                        Text("\(vin.count)/17").font(.caption).foregroundStyle(vin.count == 17 ? .green : .secondary)
                        Spacer()
                        if let obdVIN = obd.vin {
                            Button("VIN de l'OBD") { vin = obdVIN; Task { await decode() } }
                                .font(.caption)
                        }
                    }
                    Button {
                        Task { await decode() }
                    } label: {
                        HStack {
                            Label("Décoder", systemImage: "barcode.viewfinder")
                            if loading { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(!NHTSAService.isValidVIN(vin) || loading)
                } footer: {
                    Text("Le numéro d'identification du véhicule (VIN) révèle le constructeur, l'usine, le modèle, la motorisation, les équipements de sécurité, etc. Données : base vPIC de la NHTSA (gratuite, mondiale pour les principaux constructeurs).")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if let r = result {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(r.make) \(r.model)").font(.title2.bold())
                            Text([r.year.map(String.init), r.engine.isEmpty ? nil : r.engine].compactMap { $0 }.joined(separator: " · "))
                                .foregroundStyle(.secondary)
                        }
                        Button {
                            var v = Vehicle()
                            v.vin = vin.uppercased()
                            v.make = r.make
                            v.model = r.model
                            if let y = r.year { v.year = y }
                            v.engine = r.engine
                            let f = r.fuel.lowercased()
                            v.fuelType = f.contains("diesel") ? .diesel : f.contains("electric") ? .electrique : .essence
                            v.vinDetails = r.all
                            store.add(v)
                            added = true
                        } label: {
                            Label(added ? "Ajouté au garage" : "Ajouter au garage", systemImage: added ? "checkmark" : "plus.circle.fill")
                        }
                        .disabled(added || r.make.isEmpty)
                    }
                    Section("Détails (\(r.all.count))") {
                        VINDetailRows(details: r.all)
                    }
                }
            }
            .navigationTitle("Décodeur VIN")
        }
    }

    private func decode() async {
        loading = true
        error = nil
        added = false
        defer { loading = false }
        do {
            let r = try await NHTSAService.decode(vin: vin)
            result = r
            if r.make.isEmpty { error = r.errorText ?? "VIN non reconnu." }
        } catch {
            result = nil
            self.error = error.localizedDescription
        }
    }
}
