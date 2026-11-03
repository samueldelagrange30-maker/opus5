import SwiftUI

/// Vue de dessus simplifiée de la voiture, ouvrants colorés selon leur état.
struct CarDoorsDiagram: View {
    let states: [Door: Bool]
    let configured: Set<Door>

    var body: some View {
        VStack(spacing: 4) {
            part(.hood, width: 110, height: 34)
            HStack(spacing: 4) {
                part(.frontLeft, width: 52, height: 62)
                part(.frontRight, width: 52, height: 62)
            }
            HStack(spacing: 4) {
                part(.rearLeft, width: 52, height: 62)
                part(.rearRight, width: 52, height: 62)
            }
            part(.trunk, width: 110, height: 34)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 30).stroke(Color.secondary.opacity(0.4), lineWidth: 2))
    }

    private func part(_ d: Door, width: CGFloat, height: CGFloat) -> some View {
        let open = states[d] == true
        let known = configured.contains(d) && states[d] != nil
        return RoundedRectangle(cornerRadius: 8)
            .fill(open ? Color.red : known ? Color.green.opacity(0.7) : Color.secondary.opacity(0.15))
            .frame(width: width, height: height)
            .overlay(Text(d.shortName).font(.caption2.bold()).foregroundStyle(open || known ? .white : .secondary))
            .animation(.easeInOut, value: open)
    }
}

/// Carte compacte affichée dans l'onglet Temps réel.
struct DoorStatusCard: View {
    @EnvironmentObject var obd: OBDManager

    private var openDoors: [Door] { Door.allCases.filter { obd.doorStates[$0] == true } }

    var body: some View {
        NavigationLink {
            DoorsView()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: openDoors.isEmpty ? "car.side.fill" : "car.side.rear.open.fill")
                    .font(.title)
                    .foregroundStyle(openDoors.isEmpty ? Color.green : .red)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Portières").font(.headline)
                    if !obd.doorConfig.isConfigured && obd.state != .demo {
                        Text("Touchez pour configurer").font(.caption).foregroundStyle(.secondary)
                    } else if obd.doorStates.isEmpty {
                        Text("Lecture en cours…").font(.caption).foregroundStyle(.secondary)
                    } else if openDoors.isEmpty {
                        Text("Tout est fermé").font(.caption).foregroundStyle(.green)
                    } else {
                        Text("Ouvert : " + openDoors.map(\.shortName).joined(separator: ", "))
                            .font(.caption.bold()).foregroundStyle(.red)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(12)
            .background(openDoors.isEmpty ? AnyShapeStyle(.background.secondary) : AnyShapeStyle(Color.red.opacity(0.12)),
                        in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}

struct DoorsView: View {
    @EnvironmentObject var obd: OBDManager
    @State private var showWizard = false

    var body: some View {
        List {
            Section {
                HStack {
                    Spacer()
                    CarDoorsDiagram(states: obd.doorStates,
                                    configured: obd.state == .demo ? Set(Door.allCases) : Set(obd.doorConfig.signals.keys))
                    Spacer()
                }
                if let d = obd.lastDoorRead {
                    Text("Dernière lecture : \(d.formatted(date: .omitted, time: .standard))")
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            Section {
                Toggle("Surveiller les portières", isOn: $obd.doorConfig.monitoringEnabled)
                Toggle("Notification à l'ouverture", isOn: $obd.doorConfig.notifyWhenOpen)
                    .onChange(of: obd.doorConfig.notifyWhenOpen) { _, on in if on { DoorAlerts.requestAuthorization() } }
                Stepper("Fréquence : 1 lecture / \(obd.doorConfig.pollEvery) cycles", value: $obd.doorConfig.pollEvery, in: 1...10)
            } footer: {
                Text("L'alerte fonctionne tant que l'adaptateur OBD est connecté (contact mis ou peu après la coupure). Une alerte renforcée est émise si une porte s'ouvre au-dessus de 5 km/h.")
            }

            Section("Configuration") {
                LabeledContent("Calculateur", value: "\(obd.doorConfig.ecu.name)")
                LabeledContent("Adresse CAN", value: "\(obd.doorConfig.ecu.request) → \(obd.doorConfig.ecu.response)")
                ForEach(Door.allCases) { d in
                    if let s = obd.doorConfig.signals[d] {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.name)
                            Text(s.label).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                    }
                }
                Button {
                    showWizard = true
                } label: {
                    Label(obd.doorConfig.isConfigured ? "Refaire l'apprentissage" : "Lancer l'apprentissage", systemImage: "wand.and.stars")
                }
                .disabled(obd.state != .connected)
                if obd.doorConfig.isConfigured {
                    Button("Effacer la configuration", role: .destructive) {
                        obd.doorConfig.signals = [:]
                        obd.doorStates = [:]
                    }
                }
            } footer: {
                Text(obd.state == .connected
                     ? "L'apprentissage lit le boîtier de carrosserie portes fermées puis chaque porte ouverte pour trouver le signal correspondant. Compatible avec les véhicules du groupe Renault (Dacia Sandero III, Clio V, Captur II…) si la passerelle de sécurité autorise la lecture."
                     : "Connectez l'adaptateur OBD (contact mis) pour lancer l'apprentissage.")
            }
        }
        .navigationTitle("Portières")
        .sheet(isPresented: $showWizard) { DoorLearningWizard() }
    }
}

// MARK: - Assistant d'apprentissage

struct DoorLearningWizard: View {
    @EnvironmentObject var obd: OBDManager
    @Environment(\.dismiss) private var dismiss

    enum Step: Equatable {
        case setup
        case scanning(String)
        case askOpen(Door)
        case askClose(Door)
        case summary
    }

    @State private var step: Step = .setup
    @State private var ecu = ECUAddress.presets[0]
    @State private var ranges: Set<DIDRange> = Set(DIDRange.presets)
    @State private var progress = 0.0
    @State private var closedA: [DIDKey: [UInt8]] = [:]
    @State private var closedB: [DIDKey: [UInt8]] = [:]
    @State private var openRead: [DIDKey: [UInt8]] = [:]
    @State private var found: [Door: [DoorSignal]] = [:]
    @State private var doorsToLearn: [Door] = [.frontLeft, .frontRight, .rearLeft, .rearRight, .trunk]
    @State private var message: String?

    private var totalCount: Int { ranges.reduce(0) { $0 + $1.count } }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .setup: setupView
                case .scanning(let title): scanningView(title)
                case .askOpen(let d): actionView(door: d, opening: true)
                case .askClose(let d): actionView(door: d, opening: false)
                case .summary: summaryView
                }
            }
            .navigationTitle("Apprentissage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        if case .scanning = step { obd.cancelDIDRead() }
                        dismiss()
                    }
                }
            }
            .interactiveDismissDisabled()
        }
    }

    private var setupView: some View {
        Form {
            Section {
                Text("1. Contact mis, moteur à l'arrêt, **toutes les portes, le coffre et le capot fermés**.\n2. Restez dans la voiture fenêtre ouverte ou à côté : l'app vous demandera d'ouvrir puis refermer chaque porte.")
                    .font(.callout)
            }
            Section("Calculateur à interroger") {
                Picker("Calculateur", selection: $ecu) {
                    ForEach(ECUAddress.presets) { Text($0.name).tag($0) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
            Section {
                ForEach(DIDRange.presets) { r in
                    Toggle(isOn: Binding(get: { ranges.contains(r) }, set: { if $0 { ranges.insert(r) } else { ranges.remove(r) } })) {
                        Text(r.label).font(.body.monospaced())
                    }
                }
            } header: {
                Text("Plages d'identifiants")
            } footer: {
                Text("\(totalCount) identifiants à lire, environ \(max(1, totalCount / 25 / 60)) à \(max(2, totalCount / 10 / 60)) min selon l'adaptateur.")
            }
            Section("Ouvrants à apprendre") {
                ForEach(Door.allCases) { d in
                    Toggle(d.name, isOn: Binding(get: { doorsToLearn.contains(d) }, set: { on in
                        if on { doorsToLearn = Door.allCases.filter { doorsToLearn.contains($0) || $0 == d } }
                        else { doorsToLearn.removeAll { $0 == d } }
                    }))
                }
            }
            if let message { Section { Text(message).foregroundStyle(.orange) } }
            Section {
                Button {
                    startBaseline()
                } label: {
                    Label("Tout est fermé, commencer", systemImage: "play.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(ranges.isEmpty || doorsToLearn.isEmpty)
                .listRowBackground(Color.clear)
            }
        }
    }

    private func scanningView(_ title: String) -> some View {
        VStack(spacing: 20) {
            Spacer()
            ProgressView(value: progress) { Text(title).font(.headline) } currentValueLabel: {
                Text("\(Int(progress * 100)) %")
            }
            .padding(.horizontal, 30)
            Text("Ne touchez pas aux portes pendant la lecture.").foregroundStyle(.secondary)
            Spacer()
        }
    }

    private func actionView(door: Door, opening: Bool) -> some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: opening ? "car.side.rear.open.fill" : "car.side.fill")
                .font(.system(size: 70))
                .foregroundStyle(opening ? Color.orange : .green)
            Text(opening ? "Ouvrez : \(door.name)" : "Refermez : \(door.name)")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text(opening ? "Laissez uniquement cet ouvrant ouvert, puis touchez le bouton." : "Fermez-le bien, puis touchez le bouton.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                opening ? readOpen(door) : readClosed(door)
            } label: {
                Text(opening ? "C'est ouvert" : "C'est fermé").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            if opening {
                Button("Passer cet ouvrant") { next(after: door) }
            }
            Spacer()
        }
        .padding(30)
    }

    private var summaryView: some View {
        Form {
            Section("Résultat") {
                ForEach(doorsToLearn) { d in
                    HStack {
                        Image(systemName: found[d]?.isEmpty == false ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(found[d]?.isEmpty == false ? .green : .red)
                        VStack(alignment: .leading) {
                            Text(d.name)
                            if let s = found[d]?.first {
                                Text(s.label).font(.caption.monospaced()).foregroundStyle(.secondary)
                                if let n = found[d]?.count, n > 1 {
                                    Text("\(n) signaux candidats, le premier est utilisé").font(.caption2).foregroundStyle(.secondary)
                                }
                            } else {
                                Text("Aucun signal trouvé").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if found.values.allSatisfy({ $0.isEmpty }) {
                Section {
                    Text(closedA.isEmpty
                         ? "Le calculateur n'a répondu à aucun identifiant : la passerelle de sécurité bloque probablement l'accès, ou l'adresse est incorrecte. Essayez le calculateur « Tableau de bord »."
                         : "\(closedA.count) identifiants ont répondu mais aucun ne change avec les portes. Essayez un autre calculateur (Tableau de bord) ou d'autres plages.")
                        .foregroundStyle(.orange)
                    Button("Recommencer") { reset() }
                }
            } else {
                Section {
                    Button {
                        var cfg = obd.doorConfig
                        cfg.ecu = ecu
                        cfg.signals = found.compactMapValues { $0.first }
                        cfg.monitoringEnabled = true
                        obd.doorConfig = cfg
                        DoorAlerts.requestAuthorization()
                        dismiss()
                    } label: {
                        Label("Enregistrer et surveiller", systemImage: "checkmark").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .listRowBackground(Color.clear)
                }
            }
        }
    }

    // MARK: Étapes

    private func reset() {
        closedA = [:]; closedB = [:]; openRead = [:]; found = [:]; progress = 0; step = .setup
    }

    private func startBaseline() {
        message = nil
        let keys = ranges.sorted { $0.id < $1.id }.flatMap(\.keys)
        progress = 0
        step = .scanning("Lecture du calculateur (portes fermées)…")
        obd.readDIDs(keys, ecu: ecu, progress: { progress = $0 }) { res in
            guard !res.isEmpty else {
                message = "Aucune réponse du calculateur \(ecu.request)/\(ecu.response). Vérifiez que le contact est mis, ou essayez un autre calculateur."
                step = .setup
                return
            }
            closedA = res
            // Deuxième lecture pour écarter les valeurs qui varient seules (compteurs, horloges…)
            progress = 0
            step = .scanning("Vérification de la stabilité…")
            obd.readDIDs(Array(res.keys), ecu: ecu, progress: { progress = $0 }) { res2 in
                closedB = res2
                if let first = doorsToLearn.first { step = .askOpen(first) } else { step = .summary }
            }
        }
    }

    private func readOpen(_ door: Door) {
        progress = 0
        step = .scanning("Lecture porte ouverte…")
        obd.readDIDs(Array(closedA.keys), ecu: ecu, progress: { progress = $0 }) { res in
            openRead = res
            step = .askClose(door)
        }
    }

    private func readClosed(_ door: Door) {
        progress = 0
        step = .scanning("Vérification porte refermée…")
        obd.readDIDs(Array(closedA.keys), ecu: ecu, progress: { progress = $0 }) { res in
            var cands = DoorLearning.candidates(closedA: closedA, closedB: closedB, open: openRead, closedAgain: res)
            // Écarte les bits déjà attribués à un autre ouvrant
            let used = Set(found.values.compactMap(\.first))
            cands.removeAll { used.contains($0) }
            found[door] = cands
            next(after: door)
        }
    }

    private func next(after door: Door) {
        if let i = doorsToLearn.firstIndex(of: door), i + 1 < doorsToLearn.count {
            step = .askOpen(doorsToLearn[i + 1])
        } else {
            step = .summary
        }
    }
}
