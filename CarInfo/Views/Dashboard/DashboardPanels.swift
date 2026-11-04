import SwiftUI
import UniformTypeIdentifiers

// MARK: - Bandeau de résumé (bas du panneau central)

struct SummaryRow: View {
    @EnvironmentObject var obd: OBDManager
    @EnvironmentObject var store: GarageStore
    @Binding var tab: DashTab
    var compact: Bool

    var body: some View {
        HStack(spacing: 12) {
            summary(icon: "door.left.hand.open", title: "Ouvrants", subtitle: doorsText, tint: doorsTint) { tab = .ouvrants }
            summary(icon: "wrench.adjustable.fill", title: "Entretien", subtitle: maintenanceText, tint: Theme.accent) { tab = .entretien }
            if !compact {
                summary(icon: "gauge.with.dots.needle.33percent", title: "Moteur", subtitle: engineText, tint: Theme.accent) { tab = .moteur }
            }
        }
        .frame(height: 64)
    }

    private func summary(icon: String, title: String, subtitle: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(LinearGradient(colors: [tint.opacity(0.9), tint.opacity(0.55)], startPoint: .top, endPoint: .bottom)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                    Text(subtitle).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.textDim).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.black.opacity(0.25)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.stroke, lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
    }

    private var openDoors: [Door] { Door.allCases.filter { obd.doorStates[$0] == true } }

    private var doorsText: String {
        if obd.doorStates.isEmpty { return obd.doorConfig.isConfigured ? "En attente" : "Pas de données" }
        return openDoors.isEmpty ? "Tout est fermé" : "Ouvert : " + openDoors.map(\.shortName).joined(separator: ", ")
    }
    private var doorsTint: Color { openDoors.isEmpty ? Theme.accent : Theme.danger }

    private var maintenanceText: String {
        guard let v = store.selectedVehicle else { return "À configurer" }
        if let next = v.nextServiceMileage {
            let r = next - v.mileage
            return r < 0 ? "Révision dépassée" : "Révision dans \(r.km)"
        }
        if let d = v.nextServiceDate {
            return "Révision le \(d.formatted(.dateTime.day().month(.abbreviated)))"
        }
        return "À configurer"
    }

    private var engineText: String {
        let rpm = obd.values[.rpm].map { String(format: "%.0f tr/min", $0) }
        let t = obd.values[.coolantTemp].map { String(format: "%.0f°C", $0) }
        let s = [rpm, t].compactMap { $0 }.joined(separator: " · ")
        return s.isEmpty ? "Non connecté" : s
    }
}

// MARK: - Onglet Ouvrants

struct DoorsPanel: View {
    @EnvironmentObject var obd: OBDManager
    @Binding var sheet: DashSheet?

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach([Door.frontLeft, .frontRight, .rearLeft, .rearRight, .trunk, .hood]) { d in
                    let open = obd.doorStates[d] == true
                    let known = obd.doorStates[d] != nil
                    HStack(spacing: 8) {
                        Circle()
                            .fill(open ? Theme.danger : known ? Theme.ok : Color.gray.opacity(0.5))
                            .frame(width: 8, height: 8)
                            .shadow(color: open ? Theme.danger : .clear, radius: 4)
                        Text(d.name)
                            .font(.system(size: 13, weight: open ? .bold : .medium))
                            .foregroundStyle(open ? .white : Theme.textDim)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Capsule().fill(open ? Theme.danger.opacity(0.18) : .black.opacity(0.25)))
                }
            }
            Spacer()
            Button { sheet = .doors } label: {
                Label(obd.doorConfig.isConfigured ? "Réglages" : "Configurer", systemImage: "slider.horizontal.3")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Capsule().fill(.white.opacity(0.12)))
            }
            .buttonStyle(PressableStyle())
        }
        .padding(4)
    }
}

// MARK: - Onglet Entretien

struct MaintenancePanel: View {
    @EnvironmentObject var store: GarageStore
    @Binding var sheet: DashSheet?

    private let cols = [GridItem(.adaptive(minimum: 170), spacing: 12)]

    var body: some View {
        if let v = store.selectedVehicle {
            ScrollView {
                LazyVGrid(columns: cols, spacing: 12) {
                    info("road.lanes", "Kilométrage", v.mileage.km)
                    info("wrench.and.screwdriver", "Prochaine révision", serviceText(v), tint: serviceTint(v))
                    info("checkmark.seal", "Contrôle technique", dateText(v.technicalInspectionDate), tint: dateTint(v.technicalInspectionDate))
                    info("shield.lefthalf.filled", "Assurance", dateText(v.insuranceExpiryDate), tint: dateTint(v.insuranceExpiryDate))
                    info("drop.fill", "Dernière vidange", lastText(v, .vidange))
                    info("fuelpump.fill", "Consommation", v.averageConsumption.map { String(format: "%.1f L/100 km", $0) } ?? "—")
                }
                HStack(spacing: 12) {
                    action("book.closed.fill", "Carnet d'entretien") { sheet = .maintenance }
                    action("fuelpump.fill", "Pleins") { sheet = .fuel }
                    action("exclamationmark.shield.fill", "Rappels") { sheet = .recalls }
                }
                .padding(.top, 12)
            }
            .scrollIndicators(.hidden)
        } else {
            VStack(spacing: 12) {
                Text("Aucun véhicule enregistré").foregroundStyle(Theme.textDim)
                action("plus", "Ajouter ma voiture") { sheet = .garage }.frame(width: 240)
            }
        }
    }

    private func info(_ icon: String, _ title: String, _ value: String, tint: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textDim)
            Text(value).font(.system(size: 17, weight: .bold)).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.black.opacity(0.25)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.stroke, lineWidth: 1))
    }

    private func action(_ icon: String, _ title: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(title, systemImage: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.accent.opacity(0.25)))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.accent.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
    }

    private func serviceText(_ v: Vehicle) -> String {
        if let n = v.nextServiceMileage { let r = n - v.mileage; return r < 0 ? "Dépassée" : "Dans \(r.km)" }
        if let d = v.nextServiceDate { return d.formatted(date: .abbreviated, time: .omitted) }
        return "À configurer"
    }
    private func serviceTint(_ v: Vehicle) -> Color {
        guard let n = v.nextServiceMileage else { return .white }
        let r = n - v.mileage
        return r < 0 ? Theme.danger : r < 1000 ? Theme.warn : .white
    }
    private func dateText(_ d: Date?) -> String { d?.formatted(date: .abbreviated, time: .omitted) ?? "—" }
    private func dateTint(_ d: Date?) -> Color {
        guard let d else { return .white }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: d).day ?? 0
        return days < 0 ? Theme.danger : days < 30 ? Theme.warn : .white
    }
    private func lastText(_ v: Vehicle, _ k: MaintenanceKind) -> String {
        guard let e = v.maintenance.filter({ $0.kind == k }).max(by: { $0.date < $1.date }) else { return "—" }
        return "\(e.date.formatted(.dateTime.day().month(.abbreviated).year())) · \(e.mileage.km)"
    }
}

// MARK: - Onglet Moteur

struct EnginePanel: View {
    @EnvironmentObject var obd: OBDManager
    @Binding var sheet: DashSheet?

    private let pids: [OBDPID] = [.engineLoad, .throttle, .intakeTemp, .oilTemp, .maf, .fuelRate, .fuelLevel, .timingAdvance, .shortFuelTrim, .longFuelTrim, .runTime, .odometer]

    var body: some View {
        if !obd.state.isLive {
            VStack(spacing: 14) {
                Image(systemName: "engine.combustion").font(.system(size: 44)).foregroundStyle(Theme.textDim)
                Text("Connectez l'adaptateur OBD pour voir les données moteur en direct.")
                    .multilineTextAlignment(.center).foregroundStyle(Theme.textDim)
                HStack {
                    Button("Rechercher l'adaptateur") { obd.startScan(); sheet = .devices }
                        .buttonStyle(.borderedProminent)
                    Button("Mode démo") { obd.startDemo() }.buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            HStack(spacing: 16) {
                VStack(spacing: 6) {
                    RingGauge(value: obd.values[.rpm], range: OBDPID.rpm.range, title: "Régime", unit: "tr/min",
                              tint: (obd.values[.rpm] ?? 0) > 5000 ? Theme.danger : Theme.accent)
                    RingGauge(value: obd.values[.speed], range: OBDPID.speed.range, title: "Vitesse", unit: "km/h", tint: Theme.ok)
                }
                .frame(maxWidth: 230)
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                        ForEach(pids.filter { obd.values[$0] != nil }) { pid in
                            let v = obd.values[pid]!
                            VStack(alignment: .leading, spacing: 4) {
                                Label(pid.name, systemImage: pid.icon)
                                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textDim).lineLimit(1)
                                HStack(alignment: .firstTextBaseline, spacing: 3) {
                                    Text(pid.format(v)).font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit()
                                        .contentTransition(.numericText())
                                    if pid != .runTime { Text(pid.unit).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textDim) }
                                }
                                .foregroundStyle(.white)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.black.opacity(0.25)))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.stroke, lineWidth: 1))
                        }
                    }
                    Button { sheet = .diagnostic } label: {
                        HStack {
                            Image(systemName: obd.milOn == true ? "exclamationmark.triangle.fill" : "checkmark.seal.fill")
                                .foregroundStyle(obd.milOn == true ? Theme.warn : Theme.ok)
                            Text(obd.milOn == true ? "Voyant moteur : \(obd.storedDTCCount ?? 0) code(s)" : "Aucun défaut moteur")
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.textDim)
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.black.opacity(0.25)))
                    }
                    .buttonStyle(PressableStyle())
                    .padding(.top, 6)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

// MARK: - Menu « Toutes les fonctions »

struct MoreMenu: View {
    @Binding var sheet: DashSheet?

    private let items: [(DashSheet, String, String, [Color])] = [
        (.garage, "Garage", "car.2.fill", [Color(white: 0.45), Color(white: 0.25)]),
        (.diagnostic, "Diagnostic", "stethoscope", [Color(red: 1, green: 0.6, blue: 0.2), Color(red: 0.9, green: 0.35, blue: 0.1)]),
        (.doors, "Portières", "door.left.hand.open", [Color(red: 1, green: 0.4, blue: 0.4), Color(red: 0.8, green: 0.15, blue: 0.2)]),
        (.maintenance, "Entretien", "wrench.adjustable.fill", [Theme.accent, Theme.accentDeep]),
        (.fuel, "Pleins", "fuelpump.fill", [Color(red: 0.4, green: 0.9, blue: 0.5), Color(red: 0.1, green: 0.6, blue: 0.3)]),
        (.vin, "Décodeur VIN", "barcode.viewfinder", [Color(red: 0.7, green: 0.5, blue: 1), Color(red: 0.45, green: 0.25, blue: 0.9)]),
        (.recalls, "Rappels", "exclamationmark.shield.fill", [Color(red: 1, green: 0.8, blue: 0.3), Color(red: 0.9, green: 0.55, blue: 0.1)]),
        (.settings, "Réglages", "gearshape.fill", [Color(white: 0.55), Color(white: 0.32)]),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 18)], spacing: 22) {
                    ForEach(items, id: \.1) { item in
                        Button {
                            sheet = nil
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { sheet = item.0 }
                        } label: {
                            VStack(spacing: 8) {
                                AppIcon(symbol: item.2, colors: item.3, size: 64)
                                Text(item.1).font(.system(size: 13, weight: .medium)).foregroundStyle(.white)
                            }
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
                .padding(24)
            }
            .background(Theme.background)
            .navigationTitle("Toutes les fonctions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { sheet = nil } } }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Réglages du tableau de bord

struct DashSettings: View {
    @EnvironmentObject var obd: OBDManager
    @EnvironmentObject var store: GarageStore
    @Environment(\.dismiss) private var dismiss
    @Binding var modelRevision: Int
    @Binding var paintRaw: String
    @State private var importing = false
    @State private var importError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Véhicule affiché") {
                    if store.vehicles.isEmpty {
                        Text("Aucun véhicule").foregroundStyle(.secondary)
                    }
                    ForEach(store.vehicles) { v in
                        Button {
                            store.selectedVehicleID = v.id
                        } label: {
                            HStack {
                                Text(v.displayName).foregroundStyle(.primary)
                                Spacer()
                                if store.selectedVehicleID == v.id { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                            }
                        }
                    }
                }

                Section("Teinte de la carrosserie") {
                    Picker("Teinte", selection: $paintRaw) {
                        ForEach(SanderoPaint.allCases) { p in
                            Label {
                                Text(p.name)
                            } icon: {
                                Image(systemName: "circle.fill").foregroundStyle(Color(p.uiColor))
                            }
                            .tag(p.rawValue)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section {
                    Button { importing = true } label: {
                        Label("Importer un modèle 3D (.usdz)", systemImage: "cube.transparent")
                    }
                    if CustomCarModel.exists {
                        Button("Revenir au modèle Sandero III intégré", role: .destructive) {
                            try? FileManager.default.removeItem(at: CustomCarModel.url)
                            modelRevision += 1
                        }
                    }
                    if let importError { Text(importError).font(.caption).foregroundStyle(.red) }
                } header: {
                    Text("Modèle 3D")
                } footer: {
                    Text("Le modèle intégré reproduit une Dacia Sandero III (cotes réelles, portières animées). Vous pouvez le remplacer par un fichier .usdz plus détaillé : il sera mis à l'échelle et centré automatiquement. Les portières animées ne sont disponibles qu'avec le modèle intégré.")
                }

                Section("Adaptateur OBD") {
                    LabeledContent("État", value: obd.state.label)
                    if obd.state.isLive {
                        Button("Déconnecter", role: .destructive) { obd.disconnect() }
                    } else {
                        Button("Rechercher un adaptateur") { obd.startScan() }
                        Button("Lancer le mode démo") { obd.startDemo() }
                    }
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [UTType.usdz]) { result in
                switch result {
                case .success(let url):
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    do {
                        try? FileManager.default.removeItem(at: CustomCarModel.url)
                        try FileManager.default.copyItem(at: url, to: CustomCarModel.url)
                        modelRevision += 1
                        importError = nil
                    } catch {
                        importError = "Import impossible : \(error.localizedDescription)"
                    }
                case .failure(let e):
                    importError = e.localizedDescription
                }
            }
        }
    }
}
