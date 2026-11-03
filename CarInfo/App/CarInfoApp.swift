import SwiftUI
import UserNotifications

@main
struct CarInfoApp: App {
    @StateObject private var store = GarageStore()
    @StateObject private var obd = OBDManager()

    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(obd)
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            GarageView()
                .tabItem { Label("Garage", systemImage: "car.fill") }
            LiveDataView()
                .tabItem { Label("Temps réel", systemImage: "gauge.with.dots.needle.67percent") }
            DiagnosticView()
                .tabItem { Label("Diagnostic", systemImage: "wrench.and.screwdriver.fill") }
            VINLookupView()
                .tabItem { Label("VIN", systemImage: "barcode.viewfinder") }
        }
    }
}
