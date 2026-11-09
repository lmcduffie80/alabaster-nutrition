import Brand
import Features
import SwiftUI

@main
struct AlabasterScheduleApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(IOSAppDelegate.self) private var appDelegate
    #else
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif

    init() {
        BrandFonts.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: AppServices.shared.model)
        }
    }
}
