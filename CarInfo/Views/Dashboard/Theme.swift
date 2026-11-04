import SwiftUI

enum Theme {
    static let bgTop = Color(red: 0.125, green: 0.135, blue: 0.160)
    static let bgBottom = Color(red: 0.055, green: 0.060, blue: 0.075)
    static let cardTop = Color(red: 0.180, green: 0.192, blue: 0.220)
    static let cardBottom = Color(red: 0.118, green: 0.126, blue: 0.148)
    static let stroke = Color.white.opacity(0.07)
    static let accent = Color(red: 0.36, green: 0.60, blue: 1.00)
    static let accentDeep = Color(red: 0.16, green: 0.40, blue: 0.92)
    static let textDim = Color.white.opacity(0.55)
    static let ok = Color(red: 0.30, green: 0.85, blue: 0.55)
    static let warn = Color(red: 1.00, green: 0.70, blue: 0.25)
    static let danger = Color(red: 1.00, green: 0.33, blue: 0.33)

    static var background: some View {
        ZStack {
            LinearGradient(colors: [bgTop, bgBottom], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [accent.opacity(0.10), .clear], center: .init(x: 0.45, y: 0.35), startRadius: 10, endRadius: 600)
        }
        .ignoresSafeArea()
    }
}

/// Panneau arrondi « verre fumé » utilisé partout dans le tableau de bord.
struct DashCard<Content: View>: View {
    var padding: CGFloat = 14
    var radius: CGFloat = 22
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.cardTop, Theme.cardBottom], startPoint: .top, endPoint: .bottom))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.13), .white.opacity(0.03)], startPoint: .top, endPoint: .bottom), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
    }
}

/// Icône d'application homogène : carré arrondi dégradé + reflet + pictogramme blanc.
struct AppIcon: View {
    let symbol: String
    let colors: [Color]
    var size: CGFloat = 54
    var symbolScale: CGFloat = 0.46

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(LinearGradient(colors: [.white.opacity(0.28), .white.opacity(0)], startPoint: .top, endPoint: .center))
                .padding(1)
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .strokeBorder(.white.opacity(0.18), lineWidth: 0.8)
            Image(systemName: symbol)
                .font(.system(size: size * symbolScale, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: (colors.last ?? .black).opacity(0.35), radius: 8, y: 4)
    }
}

/// Raccourcis vers les applications de conduite (ouvertes par leur schéma d'URL, sinon par le web).
enum DashApp: String, CaseIterable, Identifiable {
    case waze, spotify, maps, youtube, web, phone
    var id: String { rawValue }

    var title: String {
        switch self {
        case .waze: return "Waze"
        case .spotify: return "Spotify"
        case .maps: return "Plans"
        case .youtube: return "YouTube"
        case .web: return "Web"
        case .phone: return "Téléphone"
        }
    }

    var symbol: String {
        switch self {
        case .waze: return "face.smiling"
        case .spotify: return "waveform"
        case .maps: return "location.fill"
        case .youtube: return "play.fill"
        case .web: return "globe"
        case .phone: return "phone.fill"
        }
    }

    var colors: [Color] {
        switch self {
        case .waze: return [Color(red: 0.45, green: 0.86, blue: 1.0), Color(red: 0.12, green: 0.62, blue: 0.92)]
        case .spotify: return [Color(red: 0.36, green: 0.92, blue: 0.45), Color(red: 0.08, green: 0.66, blue: 0.28)]
        case .maps: return [Color(red: 0.40, green: 0.66, blue: 1.0), Color(red: 0.12, green: 0.38, blue: 0.95)]
        case .youtube: return [Color(red: 1.0, green: 0.30, blue: 0.27), Color(red: 0.84, green: 0.05, blue: 0.08)]
        case .web: return [Color(white: 0.62), Color(white: 0.38)]
        case .phone: return [Color(red: 0.40, green: 0.90, blue: 0.45), Color(red: 0.10, green: 0.70, blue: 0.30)]
        }
    }

    var url: URL {
        switch self {
        case .waze: return URL(string: "waze://")!
        case .spotify: return URL(string: "spotify://")!
        case .maps: return URL(string: "maps://")!
        case .youtube: return URL(string: "youtube://")!
        case .web: return URL(string: "https://www.google.fr")!
        case .phone: return URL(string: "mobilephone://")!
        }
    }

    var fallback: URL {
        switch self {
        case .waze: return URL(string: "https://www.waze.com/ul")!
        case .spotify: return URL(string: "https://open.spotify.com")!
        case .maps: return URL(string: "https://maps.apple.com")!
        case .youtube: return URL(string: "https://www.youtube.com")!
        case .web: return URL(string: "https://www.google.fr")!
        case .phone: return URL(string: "tel://")!
        }
    }
}

struct DashAppButton: View {
    @Environment(\.openURL) private var openURL
    let app: DashApp
    var size: CGFloat = 54

    var body: some View {
        Button {
            openURL(app.url) { ok in if !ok { openURL(app.fallback) } }
        } label: {
            AppIcon(symbol: app.symbol, colors: app.colors, size: size)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(app.title)
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.93 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Onglets en pilule (Véhicule / Ouvrants / Entretien / Moteur).
struct PillTabs<T: Hashable & Identifiable>: View {
    let items: [T]
    @Binding var selection: T
    let title: (T) -> String
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 2) {
            ForEach(items) { item in
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { selection = item }
                } label: {
                    Text(title(item))
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                        .fixedSize()
                        .foregroundStyle(selection == item ? .white : Theme.textDim)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background {
                            if selection == item {
                                Capsule().fill(Color.white.opacity(0.16))
                                    .overlay(Capsule().strokeBorder(.white.opacity(0.15), lineWidth: 0.8))
                                    .matchedGeometryEffect(id: "pill", in: ns)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule().fill(Color.black.opacity(0.28)))
        .overlay(Capsule().strokeBorder(Theme.stroke, lineWidth: 1))
    }
}

/// Tuile de mesure (Vitesse, Moteur, Batterie, Turbo) avec barre de progression.
struct MetricTile: View {
    let title: String
    let value: String
    let unit: String
    var progress: Double?
    var footnote: String?
    var tint: Color = Theme.accent

    var body: some View {
        DashCard(padding: 14, radius: 20) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textDim)
                Spacer(minLength: 6)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(value)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(unit)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.textDim)
                }
                Spacer(minLength: 6)
                if let footnote {
                    Text(footnote).font(.system(size: 12, weight: .medium)).foregroundStyle(tint)
                }
                if let progress {
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.10))
                            Capsule()
                                .fill(LinearGradient(colors: [tint.opacity(0.7), tint], startPoint: .leading, endPoint: .trailing))
                                .frame(width: max(4, g.size.width * min(1, max(0, progress))))
                                .shadow(color: tint.opacity(0.6), radius: 4)
                        }
                    }
                    .frame(height: 5)
                    .animation(.easeOut(duration: 0.4), value: progress)
                }
            }
        }
    }
}
