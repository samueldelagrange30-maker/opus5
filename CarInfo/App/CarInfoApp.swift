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
        DashboardView()
    }
}
