import Foundation
import Testing
@testable import Alabaster

@MainActor @Suite(.serialized)
struct PushTests {
    init() { Push.shared.webView = nil }

    @Test func tappedNotificationOpensItsPageOnLaunch() {
        Push.shared.open(path: "/schedule")
        #expect(Push.shared.takeStartURL().absoluteString == "https://app.alabasternutrition.com/schedule")
        #expect(Push.shared.takeStartURL() == LinkPolicy.home)
    }

    @Test func ignoresPagesOutsideTheApp() {
        Push.shared.open(path: "https://example.com/phish")
        #expect(Push.shared.takeStartURL() == LinkPolicy.home)
    }
}
