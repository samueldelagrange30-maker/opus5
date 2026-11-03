import SwiftUI

struct LiveDataView: View {
    @EnvironmentObject var obd: OBDManager
    @State private var showDevices = false

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 10)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ConnectionBadge()

                    if obd.state.isLive {
                        liveContent
                    } else {
                        connectPanel
                    }
                }
                .padding()
            }
            .navigationTitle("Temps réel")
            .toolbar {
                if obd.state.isLive {
                    Button("Déconnecter", role: .destructive) { obd.disconnect() }
                }
            }
            .sheet(isPresented: $showDevices) { DevicePicker() }
        }
    }

    private var connectPanel: some View {
        VStack(spacing: 16) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 54))
                .foregroundStyle(Color.accentColor)
                .padding(.top, 30)
            Text("Connectez un adaptateur OBD-II")
                .font(.title3.bold())
            Text("Branchez un adaptateur ELM327 **Bluetooth LE** (Vgate iCar Pro BLE, Veepeak OBDCheck BLE, OBDLink CX…) sur la prise OBD de votre voiture (sous le volant), mettez le contact puis lancez la recherche.\n\nLes adaptateurs Bluetooth « classiques » ne fonctionnent pas avec l'iPhone.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                obd.startScan()
                showDevices = true
            } label: {
                Label("Rechercher un adaptateur", systemImage: "magnifyingglass")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button {
                obd.startDemo()
            } label: {
                Label("Essayer en mode démo", systemImage: "play.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            if obd.state == .connecting || obd.state == .initializing {
                ProgressView(obd.state.label)
            }
            if case .failed(let msg) = obd.state {
                Text(msg).font(.callout).foregroundStyle(.red).multilineTextAlignment(.center)
            }
        }
    }

    @ViewBuilder
    private var liveContent: some View {
        HStack(spacing: 8) {
            RingGauge(value: obd.values[.rpm], range: OBDPID.rpm.range, title: "Régime", unit: "tr/min",
                      tint: (obd.values[.rpm] ?? 0) > 5000 ? .red : .accentColor)
            RingGauge(value: obd.values[.speed], range: OBDPID.speed.range, title: "Vitesse", unit: "km/h", tint: .blue)
        }

        LazyVGrid(columns: columns, spacing: 10) {
            if let b = obd.batteryVoltage {
                StatTile(icon: "minus.plus.batteryblock.fill", title: "Batterie", value: String(format: "%.1f", b), unit: "V",
                         tint: b < 12.0 ? .red : b < 12.4 ? .orange : .accentColor)
            }
            if let fuelRate = obd.values[.fuelRate], let speed = obd.values[.speed], speed > 5 {
                StatTile(icon: "drop.fill", title: "Conso. instantanée", value: String(format: "%.1f", fuelRate / speed * 100), unit: "L/100")
            } else if let maf = obd.values[.maf], let speed = obd.values[.speed], speed > 5 {
                // Estimation essence : MAF / (AFR 14,7 × densité 740 g/L)
                let lph = maf * 3600 / (14.7 * 740)
                StatTile(icon: "drop.fill", title: "Conso. estimée", value: String(format: "%.1f", lph / speed * 100), unit: "L/100")
            }
            ForEach(OBDPID.allCases.filter { $0 != .rpm && $0 != .speed && obd.values[$0] != nil }) { pid in
                let v = obd.values[pid]!
                StatTile(icon: pid.icon, title: pid.name, value: pid.format(v), unit: pid == .runTime ? "" : pid.unit, tint: tint(for: pid, v))
            }
        }

        GroupBox("Adaptateur") {
            VStack(alignment: .leading, spacing: 6) {
                LabeledContent("Appareil", value: obd.connectedName ?? "—")
                LabeledContent("Version", value: obd.adapterVersion ?? "—")
                LabeledContent("Protocole", value: obd.protocolName ?? "—")
                LabeledContent("PIDs supportés", value: "\(obd.supportedPIDs.count)")
                if let vin = obd.vin { LabeledContent("VIN", value: vin) }
            }
            .font(.callout)
        }
    }

    private func tint(for pid: OBDPID, _ v: Double) -> Color {
        switch pid {
        case .coolantTemp: return v > 105 ? .red : v < 60 ? .blue : .accentColor
        case .oilTemp: return v > 120 ? .red : .accentColor
        case .fuelLevel: return v < 15 ? .orange : .accentColor
        case .moduleVoltage: return v < 12 || v > 15 ? .red : .accentColor
        case .distanceWithMIL: return v > 0 ? .orange : .accentColor
        default: return .accentColor
        }
    }
}

struct DevicePicker: View {
    @EnvironmentObject var obd: OBDManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(obd.devices) { d in
                        Button {
                            obd.connect(d)
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: d.likelyOBD ? "car.fill" : "dot.radiowaves.left.and.right")
                                    .foregroundStyle(d.likelyOBD ? Color.accentColor : .secondary)
                                VStack(alignment: .leading) {
                                    Text(d.name).foregroundStyle(.primary)
                                    if d.likelyOBD { Text("Adaptateur OBD probable").font(.caption).foregroundStyle(.green) }
                                }
                                Spacer()
                                Text("\(d.rssi) dBm").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text("Appareils Bluetooth LE")
                        Spacer()
                        if obd.state == .scanning { ProgressView() }
                    }
                } footer: {
                    Text(obd.state == .bluetoothOff ? "Activez le Bluetooth dans les Réglages." :
                         obd.state == .unauthorized ? "Autorisez l'accès Bluetooth dans Réglages › Mon Auto." :
                         "Votre adaptateur s'appelle souvent « OBDII », « IOS-Vlink », « V-LINK », « OBDBLE » ou « VEEPEAK ».")
                }
            }
            .navigationTitle("Adaptateurs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { obd.stopScan(); dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Relancer") { obd.startScan() }.disabled(obd.state == .scanning)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
