import Foundation

enum LinkPolicy {
    static let home = URL(string: "https://app.alabasternutrition.com")!

    /// Hosts that stay inside the app: the website and Clerk's sign-in pages. Everything else opens in Safari.
    static func staysInApp(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return true }
        guard scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "alabasternutrition.com"
            || host.hasSuffix(".alabasternutrition.com")
            || host.hasSuffix(".clerk.accounts.dev")
            || host == "clerk.com"
            || host.hasSuffix(".clerk.com")
    }
}
