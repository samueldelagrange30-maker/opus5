import SwiftUI

struct DiagnosticView: View {
    @EnvironmentObject var obd: OBDManager
    @State private var confirmClear = false
    @State private var clearResult: String?
    @State private var rawCommand = ""
    @State private var rawResponse = ""

    var body: some View {
        NavigationStack {
            List {
                Section { ConnectionBadge().frame(maxWidth: .infinity) }
                    .listRowBackground(Color.clear)

                if !obd.state.isLive {
                    ContentUnavailableView("Non connecté", systemImage: "wrench.and.screwdriver",
                                           description: Text("Connectez un adaptateur OBD-II depuis l'onglet « Temps réel » (ou lancez le mode démo) pour lire les codes défaut."))
                } else {
                    Section("Voyant moteur (MIL)") {
                        HStack(spacing: 14) {
                            Image(systemName: "engine.combustion.fill")
                                .font(.largeTitle)
                                .foregroundStyle(obd.milOn == true ? .orange : .green)
                            VStack(alignment: .leading) {
                                Text(obd.milOn == nil ? "Statut inconnu" : obd.milOn! ? "Voyant allumé" : "Voyant éteint")
                                    .font(.headline)
                                Text("\(obd.storedDTCCount ?? obd.dtcs.count) code(s) mémorisé(s)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Button {
                            obd.readDTCs()
                        } label: {
                            HStack {
                                Label("Lire les codes défaut", systemImage: "arrow.clockwise")
                                if obd.isReadingDTC { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(obd.isReadingDTC)
                        if let d = obd.lastDTCRead {
                            Text("Dernière lecture : \(d.formatted(date: .omitted, time: .standard))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    Section("Codes confirmés") {
                        if obd.dtcs.isEmpty {
                            Label("Aucun code défaut", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                        }
                        ForEach(obd.dtcs) { DTCRow(dtc: $0) }
                    }

                    Section("Codes en attente") {
                        if obd.pendingDTCs.isEmpty {
                            Text("Aucun").foregroundStyle(.secondary)
                        }
                        ForEach(obd.pendingDTCs) { DTCRow(dtc: $0) }
                    }

                    Section {
                        Button("Effacer les codes et éteindre le voyant", role: .destructive) { confirmClear = true }
                        if let clearResult { Text(clearResult).font(.caption) }
                    } footer: {
                        Text("Moteur à l'arrêt, contact mis. L'effacement remet à zéro les moniteurs de préparation : le véhicule peut échouer au contrôle technique tant qu'ils ne sont pas revenus prêts. Si la panne persiste, le voyant se rallumera.")
                    }

                    if obd.state == .connected {
                        Section("Terminal ELM327") {
                            HStack {
                                TextField("Commande (ex. 010C, ATRV)", text: $rawCommand)
                                    .textInputAutocapitalization(.characters)
                                    .autocorrectionDisabled()
                                    .font(.body.monospaced())
                                Button("Envoyer") {
                                    let c = rawCommand
                                    obd.sendRaw(c) { rawResponse = "\(c) → \($0)" }
                                }
                                .disabled(rawCommand.isEmpty)
                            }
                            if !rawResponse.isEmpty {
                                Text(rawResponse).font(.caption.monospaced()).textSelection(.enabled)
                            }
                        }
                    }
                }

                if !obd.log.isEmpty {
                    Section("Journal") {
                        NavigationLink("Afficher le journal (\(obd.log.count) lignes)") {
                            ScrollView {
                                Text(obd.log.joined(separator: "\n"))
                                    .font(.caption.monospaced())
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding()
                            }
                            .navigationTitle("Journal OBD")
                            .toolbar { ShareLink(item: obd.log.joined(separator: "\n")) }
                        }
                    }
                }
            }
            .navigationTitle("Diagnostic")
            .confirmationDialog("Effacer tous les codes défaut ?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Effacer", role: .destructive) {
                    obd.clearDTCs { ok in clearResult = ok ? "✓ Codes effacés" : "Échec de l'effacement (moteur en marche ?)" }
                }
            }
        }
    }
}

struct DTCRow: View {
    let dtc: DTC
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(dtc.code).font(.headline.monospaced())
                Spacer()
                Text(dtc.system).font(.caption).foregroundStyle(.secondary)
            }
            Text(dtc.description).font(.callout)
            Link(destination: URL(string: "https://www.google.com/search?q=\(dtc.code)+code+defaut+OBD")!) {
                Label("Rechercher ce code", systemImage: "magnifyingglass").font(.caption)
            }
        }
        .padding(.vertical, 2)
    }
}
