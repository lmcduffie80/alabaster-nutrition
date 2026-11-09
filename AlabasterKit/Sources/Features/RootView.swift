import Brand
import Combine
import CoreData
import Domain
import SwiftUI

public struct RootView: View {
    private let model: AppModel

    public init(model: AppModel) {
        self.model = model
    }

    public var body: some View {
        content
            .tint(BrandPalette.porcelain.color)
            .task { await model.refresh() }
            .onReceive(NotificationCenter.default.publisher(for: .NSPersistentStoreRemoteChange)) { _ in
                Task { await model.refresh() }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.loadState {
        case .loading:
            ProgressView()
        case .iCloudUnavailable:
            unavailable(
                title: "Sign in to iCloud",
                symbol: "icloud.slash",
                message: "Alabaster Schedule keeps your team's schedule in iCloud. Open Settings, sign in with your Apple Account, make sure iCloud is on for this app, then try again."
            )
        case .failed(let message):
            unavailable(title: "Something went wrong", symbol: "exclamationmark.triangle", message: message)
        case .loaded:
            switch model.role {
            case .needsSetup: WelcomeView(model: model)
            case .manager: ManagerHomeView(model: model)
            case .employee: EmployeeHomeView(model: model)
            }
        }
    }

    private func unavailable(title: String, symbol: String, message: String) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") { Task { await model.refresh() } }
                .buttonStyle(.borderedProminent)
        }
    }
}
