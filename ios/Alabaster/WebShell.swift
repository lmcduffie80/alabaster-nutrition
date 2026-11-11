import SwiftUI
import UIKit
import WebKit

/// The website, full screen. Links outside `LinkPolicy` open in Safari; file downloads open the share sheet.
struct WebShell: UIViewRepresentable {
    @Binding var offline: Bool
    let retry: Int

    func makeCoordinator() -> Coordinator { Coordinator(offline: $offline) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        configuration.applicationNameForUserAgent = "AlabasterApp/\(version)"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "Paper")
        #if DEBUG
        webView.isInspectable = true
        #endif

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        webView.load(URLRequest(url: LinkPolicy.home))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastRetry != retry else { return }
        context.coordinator.lastRetry = retry
        if let url = webView.url, url.absoluteString != "about:blank" {
            webView.reload()
        } else {
            webView.load(URLRequest(url: LinkPolicy.home))
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        @Binding var offline: Bool
        weak var webView: WKWebView?
        var lastRetry = 0
        private var downloads: [ObjectIdentifier: URL] = [:]

        init(offline: Binding<Bool>) { _offline = offline }

        @objc func pullToRefresh(_ control: UIRefreshControl) {
            webView?.reload()
        }

        // MARK: Navigation

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            if action.shouldPerformDownload { return .download }
            let mainFrame = action.targetFrame?.isMainFrame ?? true
            if !mainFrame || LinkPolicy.staysInApp(url) { return .allow }
            await UIApplication.shared.open(url)
            return .cancel
        }

        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
            let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
            if disposition.lowercased().hasPrefix("attachment") || !response.canShowMIMEType { return .download }
            return .allow
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            offline = false
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            fail(webView, error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            fail(webView, error)
        }

        private func fail(_ webView: WKWebView, _ error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            let code = (error as NSError).code
            if code == NSURLErrorCancelled || code == 102 /* frame load interrupted, e.g. a download */ { return }
            if (error as NSError).domain == NSURLErrorDomain { offline = true }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        /// `target="_blank"` links: ours load in place, others go to Safari.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if LinkPolicy.staysInApp(url) { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        // MARK: Downloads (CSV reports)

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = folder.appendingPathComponent(suggestedFilename)
            downloads[ObjectIdentifier(download)] = destination
            return destination
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)), let webView else { return }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = webView
            sheet.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
            webView.window?.rootViewController?.present(sheet, animated: true)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloads.removeValue(forKey: ObjectIdentifier(download))
        }
    }
}
