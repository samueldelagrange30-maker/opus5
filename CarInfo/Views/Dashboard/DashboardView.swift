import SwiftUI

enum DashTab: String, CaseIterable, Identifiable {
    case vehicule, ouvrants, entretien, moteur
    var id: String { rawValue }
    var title: String {
        switch self {
        case .vehicule: return "Véhicule"
        case .ouvrants: return "Ouvrants"
        case .entretien: return "Entretien"
        case .moteur: return "Moteur"
        }
    }
}

enum DashSheet: String, Identifiable {
    case menu, garage, diagnostic, vin, doors, devices, settings, maintenance, fuel, recalls
    var id: String { rawValue }
}

struct DashboardView: View {
    @EnvironmentObject var store: GarageStore
    @EnvironmentObject var obd: OBDManager
    @AppStorage("paint") private var paintRaw = SanderoPaint.grisComete.rawValue
    @AppStorage("modelRevision") private var modelRevision = 0
    @State private var tab: DashTab = .vehicule
    @State private var rotationSteps = 0
    @State private var sheet: DashSheet?

    private var paint: SanderoPaint { SanderoPaint(rawValue: paintRaw) ?? .grisComete }

    var body: some View {
        GeometryReader { geo in
            let landscape = geo.size.width > geo.size.height
            ZStack {
                Theme.background
                if landscape {
                    landscapeLayout(geo.size)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                } else {
                    portraitLayout(geo.size)
                }
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .sheet(item: $sheet) { s in sheetView(s).preferredColorScheme(.dark) }
        .onAppear(perform: handleLaunchArguments)
    }

    // MARK: Mises en page

    private func landscapeLayout(_ size: CGSize) -> some View {
        let short = size.height < 520
        let rightWidth = min(330, max(short ? 230 : 250, size.width * 0.28))
        return HStack(spacing: short ? 10 : 14) {
            DockView(sheet: $sheet, compact: short)
                .frame(width: short ? 64 : 78)
            centerPanel(compact: false, short: short)
            RightColumn(sheet: $sheet, compact: short)
                .frame(width: rightWidth)
        }
    }

    private func portraitLayout(_ size: CGSize) -> some View {
        ScrollView {
            VStack(spacing: 14) {
                centerPanel(compact: true, short: false)
                    .frame(height: max(480, size.height * 0.52))
                PortraitTiles(sheet: $sheet)
                HStack(spacing: 14) {
                    ForEach([DashApp.waze, .spotify, .maps, .youtube, .web]) { DashAppButton(app: $0, size: 52) }
                    Button { sheet = .menu } label: {
                        AppIcon(symbol: "square.grid.2x2.fill", colors: [Color(white: 0.32), Color(white: 0.18)], size: 52)
                    }
                    .buttonStyle(PressableStyle())
                }
                .frame(maxWidth: .infinity)
            }
            .padding(14)
        }
    }

    private func centerPanel(compact: Bool, short: Bool) -> some View {
        DashCard(padding: short ? 12 : 18, radius: 26) {
            VStack(spacing: short ? 8 : 12) {
                header(compact: compact, short: short)
                ZStack {
                    // La scène 3D reste chargée pour un passage instantané entre onglets.
                    CarSceneView(paint: paint, doorStates: obd.doorStates,
                                 mode: tab == .ouvrants ? .doors : .showcase,
                                 rotationSteps: rotationSteps, modelRevision: modelRevision)
                        .opacity(tab == .vehicule || tab == .ouvrants ? 1 : 0)
                        .allowsHitTesting(tab == .vehicule || tab == .ouvrants)

                    switch tab {
                    case .vehicule: vehicleOverlay
                    case .ouvrants: DoorsPanel(sheet: $sheet, short: short)
                    case .entretien: MaintenancePanel(sheet: $sheet)
                    case .moteur: EnginePanel(sheet: $sheet)
                    }
                }
                .frame(maxHeight: .infinity)
                SummaryRow(tab: $tab, compact: compact, short: short)
            }
        }
    }

    private func header(compact: Bool, short: Bool) -> some View {
        let v = store.selectedVehicle
        let titleView = VStack(alignment: .leading, spacing: 4) {
            Text(v?.displayName ?? "Dacia Sandero")
                .font(.system(size: short ? 20 : (compact ? 24 : 28), weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            HStack(spacing: 6) {
                Circle().fill(statusColor).frame(width: 7, height: 7)
                    .shadow(color: statusColor, radius: 4)
                Text(statusText)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textDim)
                    .lineLimit(1)
            }
        }
        let tabs = PillTabs(items: DashTab.allCases, selection: $tab, title: \.title)
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .top) {
                titleView
                Spacer(minLength: 12)
                tabs
            }
            VStack(alignment: .leading, spacing: 8) {
                titleView
                ScrollView(.horizontal, showsIndicators: false) { tabs }
            }
        }
    }

    private var vehicleOverlay: some View {
        VStack {
            HStack {
                Spacer()
                PaintPicker(selection: $paintRaw)
            }
            Spacer()
            HStack {
                arrow("chevron.left") { rotationSteps -= 1 }
                Spacer()
                arrow("chevron.right") { rotationSteps += 1 }
            }
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private func arrow(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, height: 40)
                .background(Circle().fill(.white.opacity(0.10)))
                .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
    }

    private var statusText: String {
        switch obd.state {
        case .connected: return "Connecté · \(obd.connectedName ?? "OBD")"
        case .demo: return "Mode démo"
        default: return obd.state.label
        }
    }

    private var statusColor: Color {
        switch obd.state {
        case .connected: return Theme.ok
        case .demo: return Theme.accent
        case .scanning, .connecting, .initializing: return Theme.warn
        case .failed, .bluetoothOff, .unauthorized: return Theme.danger
        case .idle: return .gray
        }
    }

    // MARK: Feuilles

    @ViewBuilder
    private func sheetView(_ s: DashSheet) -> some View {
        switch s {
        case .menu: MoreMenu(sheet: $sheet)
        case .garage: GarageView()
        case .diagnostic: DiagnosticView()
        case .vin: VINLookupView()
        case .devices: DevicePicker()
        case .settings: DashSettings(modelRevision: $modelRevision, paintRaw: $paintRaw)
        case .doors: NavigationStack { DoorsView().toolbar { closeButton } }
        case .maintenance, .fuel, .recalls:
            if let id = store.selectedVehicleID, let b = store.binding(for: id) {
                NavigationStack {
                    Group {
                        if s == .maintenance { MaintenanceListView(vehicle: b) }
                        else if s == .fuel { FuelListView(vehicle: b) }
                        else { RecallsView(make: b.wrappedValue.make, model: b.wrappedValue.model, year: b.wrappedValue.year) }
                    }
                    .toolbar { closeButton }
                }
            } else {
                GarageView()
            }
        }
    }

    private var closeButton: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) { Button("Fermer") { sheet = nil } }
    }

    // MARK: Arguments de lancement (captures automatiques)

    private func handleLaunchArguments() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-demo") { obd.startDemo() }
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count, let t = DashTab(rawValue: args[i + 1]) { tab = t }
        if args.contains("-landscape") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                (UIApplication.shared.connectedScenes.first as? UIWindowScene)?
                    .requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
            }
        }
    }
}

// MARK: - Dock de gauche

struct DockView: View {
    @Binding var sheet: DashSheet?
    var compact = false

    private var icon: CGFloat { compact ? 42 : 54 }

    var body: some View {
        DashCard(padding: compact ? 8 : 10, radius: 24) {
            VStack(spacing: compact ? 8 : 14) {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text(ctx.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                        .font(.system(size: 15, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
                .padding(.top, compact ? 2 : 6)
                Button { sheet = .garage } label: {
                    AppIcon(symbol: "car.fill", colors: [Color(white: 0.30), Color(white: 0.16)], size: icon)
                }
                .buttonStyle(PressableStyle())
                DashAppButton(app: .waze, size: icon)
                DashAppButton(app: .spotify, size: icon)
                DashAppButton(app: .maps, size: icon)
                Spacer(minLength: 0)
                if !compact {
                    Button { sheet = .diagnostic } label: {
                        AppIcon(symbol: "stethoscope", colors: [Color(white: 0.26), Color(white: 0.14)], size: 46)
                    }
                    .buttonStyle(PressableStyle())
                }
                Button { sheet = .menu } label: {
                    AppIcon(symbol: "square.grid.2x2.fill", colors: [Color(white: 0.26), Color(white: 0.14)], size: compact ? 38 : 46)
                }
                .buttonStyle(PressableStyle())
                .padding(.bottom, 4)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Colonne de droite

struct RightColumn: View {
    @EnvironmentObject var obd: OBDManager
    @Binding var sheet: DashSheet?
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 8 : 12) {
            OBDTile(sheet: $sheet).frame(height: compact ? 60 : 86)
            HStack(spacing: 12) {
                smallTile(app: .youtube)
                smallTile(app: .web)
                Button { sheet = .settings } label: {
                    tileBody(AppIcon(symbol: "gearshape.fill", colors: [Color(white: 0.55), Color(white: 0.32)], size: 40, symbolScale: 0.5))
                }
                .buttonStyle(PressableStyle())
            }
            .frame(height: compact ? 48 : 66)
            if !compact { ClockTile().frame(height: 92) }
            MetricsGrid(compact: compact)
        }
    }

    private func smallTile(app: DashApp) -> some View {
        DashAppTile(app: app)
    }

    private func tileBody(_ icon: some View) -> some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(LinearGradient(colors: [Theme.cardTop, Theme.cardBottom], startPoint: .top, endPoint: .bottom))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.10), lineWidth: 1))
            .overlay(icon)
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
    }
}

struct DashAppTile: View {
    @Environment(\.openURL) private var openURL
    let app: DashApp

    var body: some View {
        Button {
            openURL(app.url) { ok in if !ok { openURL(app.fallback) } }
        } label: {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(LinearGradient(colors: app.colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient(colors: [.white.opacity(0.25), .clear], startPoint: .top, endPoint: .center)))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.18), lineWidth: 1))
                .overlay(Image(systemName: app.symbol).font(.system(size: 22, weight: .bold)).foregroundStyle(.white))
                .shadow(color: (app.colors.last ?? .black).opacity(0.35), radius: 8, y: 4)
        }
        .buttonStyle(PressableStyle())
    }
}

/// Grande tuile bleue : connexion à l'adaptateur OBD (équivalent du raccourci CarPlay de la maquette).
struct OBDTile: View {
    @EnvironmentObject var obd: OBDManager
    @Binding var sheet: DashSheet?

    var body: some View {
        Button {
            switch obd.state {
            case .connected, .demo: sheet = .diagnostic
            default:
                obd.startScan()
                sheet = .devices
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: obd.state.isLive ? "antenna.radiowaves.left.and.right" : "cable.connector")
                    .font(.system(size: 22, weight: .semibold))
                    .frame(width: 42, height: 42)
                    .background(RoundedRectangle(cornerRadius: 13).fill(.white.opacity(0.18)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(obd.state.isLive ? (obd.connectedName ?? "OBD") : "Connexion OBD")
                        .font(.system(size: 17, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(obd.state.isLive ? "Ouvrir le diagnostic" : "Rechercher l'adaptateur")
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .opacity(0.8)
                }
                Spacer()
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.accent, Theme.accentDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: [.white.opacity(0.22), .clear], startPoint: .top, endPoint: .center)))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.25), lineWidth: 1))
            .shadow(color: Theme.accent.opacity(0.45), radius: 14, y: 6)
        }
        .buttonStyle(PressableStyle())
    }
}

struct ClockTile: View {
    var body: some View {
        DashCard(padding: 16, radius: 22) {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                HStack(alignment: .center, spacing: 12) {
                    Text(ctx.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .layoutPriority(1)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(ctx.date.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "fr_FR"))))
                        Text(ctx.date.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "fr_FR"))))
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .frame(maxHeight: .infinity)
            }
        }
    }
}

struct MetricsGrid: View {
    @EnvironmentObject var obd: OBDManager
    var compact = false

    var body: some View {
        Grid(horizontalSpacing: compact ? 8 : 12, verticalSpacing: compact ? 8 : 12) {
            GridRow {
                speedTile
                coolantTile
            }
            GridRow {
                batteryTile
                turboTile
            }
        }
    }

    private var speedTile: some View {
        let v = obd.values[.speed]
        return MetricTile(title: "Vitesse", value: v.map { String(format: "%.0f", $0) } ?? "—", unit: "km/h",
                          progress: (v ?? 0) / 180)
    }

    private var coolantTile: some View {
        let v = obd.values[.coolantTemp]
        let hot = (v ?? 0) > 105
        return MetricTile(title: "Moteur", value: v.map { String(format: "%.0f", $0) } ?? "—", unit: "°C",
                          progress: ((v ?? 0) - 20) / 100, tint: hot ? Theme.danger : Theme.accent)
    }

    private var batteryTile: some View {
        let v = obd.batteryVoltage ?? obd.values[.moduleVoltage]
        let status: String? = v.map { $0 >= 13.2 ? "Charge OK" : $0 >= 12.4 ? "Batterie OK" : "Batterie faible" }
        let tint = (v ?? 13) < 12.2 ? Theme.danger : Theme.ok
        return MetricTile(title: "Batterie", value: v.map { String(format: "%.1f", $0) } ?? "—", unit: "V",
                          footnote: status, tint: tint)
    }

    private var turboTile: some View {
        var boost: Double?
        if let map = obd.values[.intakePressure] {
            boost = max(0, (map - (obd.values[.baroPressure] ?? 101)) / 100)
        }
        return MetricTile(title: "Turbo", value: boost.map { String(format: "%.2f", $0) } ?? "—", unit: "bar",
                          progress: (boost ?? 0) / 1.2)
    }
}

/// Tuiles de la colonne de droite, réorganisées pour l'iPhone en portrait.
struct PortraitTiles: View {
    @Binding var sheet: DashSheet?

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                OBDTile(sheet: $sheet)
                ClockTile()
            }
            .frame(height: 86)
            MetricsGrid().frame(height: 250)
        }
    }
}

// MARK: - Sélecteur de teinte

struct PaintPicker: View {
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 7) {
            ForEach(SanderoPaint.allCases) { p in
                Button {
                    withAnimation { selection = p.rawValue }
                } label: {
                    Circle()
                        .fill(Color(p.uiColor).gradient)
                        .frame(width: 18, height: 18)
                        .overlay(Circle().strokeBorder(.white.opacity(selection == p.rawValue ? 0.95 : 0.25), lineWidth: selection == p.rawValue ? 2 : 1))
                        .padding(2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(p.name)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(Capsule().fill(.black.opacity(0.3)))
        .overlay(Capsule().strokeBorder(Theme.stroke, lineWidth: 1))
    }
}
