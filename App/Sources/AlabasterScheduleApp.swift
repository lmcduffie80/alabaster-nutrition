import Brand
import Features
import SwiftUI

@main
struct AlabasterScheduleApp: App {
    init() {
        BrandFonts.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: AppServices.shared.model)
        }
    }
}
