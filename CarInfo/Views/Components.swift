import SwiftUI

struct RingGauge: View {
    let value: Double?
    let range: ClosedRange<Double>
    let title: String
    let unit: String
    var format: (Double) -> String = { String(format: "%.0f", $0) }
    var tint: Color = .accentColor

    private var fraction: Double {
        guard let value else { return 0 }
        return min(1, max(0, (value - range.lowerBound) / (range.upperBound - range.lowerBound)))
    }

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(Color.secondary.opacity(0.2), style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(135))
            Circle()
                .trim(from: 0, to: 0.75 * fraction)
                .stroke(
                    AngularGradient(colors: [tint.opacity(0.6), tint], center: .center, startAngle: .degrees(0), endAngle: .degrees(270)),
                    style: StrokeStyle(lineWidth: 14, lineCap: .round)
                )
                .rotationEffect(.degrees(135))
                .animation(.easeOut(duration: 0.35), value: fraction)
            VStack(spacing: 2) {
                Text(value.map(format) ?? "—")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text(unit).font(.caption).foregroundStyle(.secondary)
                Text(title).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).padding(.top, 2)
            }
        }
        .padding(10)
        .aspectRatio(1, contentMode: .fit)
    }
}

struct StatTile: View {
    let icon: String
    let title: String
    let value: String
    var unit: String = ""
    var tint: Color = .accentColor

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(tint == .accentColor ? Color.primary : tint)
                    .contentTransition(.numericText())
                if !unit.isEmpty { Text(unit).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct DeadlineRow: View {
    let title: String
    let icon: String
    let date: Date?

    var body: some View {
        HStack {
            Label(title, systemImage: icon)
            Spacer()
            if let date {
                let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: date).day ?? 0
                VStack(alignment: .trailing) {
                    Text(date, format: .dateTime.day().month().year())
                    Text(days < 0 ? "Dépassé de \(-days) j" : "Dans \(days) j")
                        .font(.caption)
                        .foregroundStyle(days < 0 ? .red : days < 30 ? .orange : .secondary)
                }
            } else {
                Text("Non renseigné").foregroundStyle(.secondary)
            }
        }
    }
}

struct ConnectionBadge: View {
    @EnvironmentObject var obd: OBDManager

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(obd.connectedName.map { "\($0) · \(obd.state.label)" } ?? obd.state.label)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.thinMaterial, in: Capsule())
    }

    private var color: Color {
        switch obd.state {
        case .connected: return .green
        case .demo: return .blue
        case .scanning, .connecting, .initializing: return .orange
        case .failed, .bluetoothOff, .unauthorized: return .red
        case .idle: return .gray
        }
    }
}

extension Double {
    var euros: String { formatted(.currency(code: "EUR")) }
}

extension Int {
    var km: String { "\(formatted(.number.grouping(.automatic))) km" }
}
