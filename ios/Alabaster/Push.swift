import UIKit
import UserNotifications
import WebKit

/// Asks for notification permission, hands the APNs device token to the website, and opens notification taps.
///
/// The page talks to it through `window.webkit.messageHandlers.metzey.postMessage({ type })` with
/// `pushStatus`, `enablePush` or `openSettings`, and hears back via a `metzey-push` DOM event.
@MainActor
final class Push: NSObject, WKScriptMessageHandler {
    static let shared = Push()
    static let handlerName = "metzey"

    weak var webView: WKWebView?
    private var token: String?
    /// A notification tapped before the web view existed, opened once it does.
    private var pendingURL: URL?

    override private init() {
        super.init()
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { Push.shared.report() }
        }
    }

    /// Where the web view should start: the tapped notification's page, or home.
    func takeStartURL() -> URL {
        defer { pendingURL = nil }
        return pendingURL ?? LinkPolicy.home
    }

    /// Tokens can change, so ask for a fresh one each launch once the person has said yes.
    func refreshRegistration() {
        Task {
            if Self.granted(await UNUserNotificationCenter.current().notificationSettings().authorizationStatus) {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func didRegister(_ deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        report()
    }

    func open(path: String) {
        guard let url = URL(string: path, relativeTo: LinkPolicy.home)?.absoluteURL, LinkPolicy.staysInApp(url) else { return }
        if let webView { webView.load(URLRequest(url: url)) } else { pendingURL = url }
    }

    // MARK: Page bridge

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == LinkPolicy.home.host,
              let type = (message.body as? [String: Any])?["type"] as? String else { return }
        switch type {
        case "pushStatus":
            report()
        case "enablePush":
            Task {
                let center = UNUserNotificationCenter.current()
                if await center.notificationSettings().authorizationStatus == .notDetermined {
                    _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
                }
                refreshRegistration()
                report()
            }
        case "openSettings":
            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
        default:
            break
        }
    }

    private func report() {
        guard let webView, webView.url?.host == LinkPolicy.home.host else { return }
        Task {
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            var detail: [String: String] = ["status": Self.granted(status) ? "granted" : status == .denied ? "denied" : "notDetermined"]
            if Self.granted(status), let token { detail["token"] = token }
            guard let json = try? JSONSerialization.data(withJSONObject: detail), let text = String(data: json, encoding: .utf8) else { return }
            _ = try? await webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('metzey-push', { detail: \(text) }))")
        }
    }

    private static func granted(_ status: UNAuthorizationStatus) -> Bool {
        status == .authorized || status == .provisional || status == .ephemeral
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Push.shared.refreshRegistration()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Push.shared.didRegister(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Push registration failed: \(error.localizedDescription)")
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let path = response.notification.request.content.userInfo["path"] as? String ?? "/schedule"
        await MainActor.run { Push.shared.open(path: path) }
    }
}
