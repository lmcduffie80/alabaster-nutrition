#if os(macOS)
import AppKit
import CloudKit

final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func application(_ application: NSApplication, userDidAcceptCloudKitShareWith metadata: CKShare.Metadata) {
        AppServices.shared.accept(metadata)
    }
}
#endif
