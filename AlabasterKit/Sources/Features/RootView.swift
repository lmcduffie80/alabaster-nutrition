import Brand
import Combine
import CoreData
import Domain
import SwiftUI

public struct RootView: View {
    private let model: AppModel
    @ViewState private var isCreatingBusiness = false

    public init(model: AppModel) {
        self.model = model
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BrandPalette.alabaster.color)
            .tint(BrandPalette.porcelain.color)
            .sheet(isPresented: $isCreatingBusiness) {
                CreateBusinessView(model: model)
            }
            .task { await model.refresh() }
            .onReceive(
                NotificationCenter.default.publisher(for: .NSPersistentStoreRemoteChange)
                    .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            ) { _ in
                Task { await model.refresh() }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.loadState {
        case .loading:
            ProgressView("Loading…")
        case .iCloudUnavailable:
            unavailable(
                title: "Sign in to iCloud",
                symbol: "icloud.slash",
                message: "Alabaster Schedule keeps your team's schedule in iCloud. Open Settings, sign in with your Apple Account, make sure iCloud is on for this app, then try again.",
                action: { await model.refresh() }
            )
        case .failed(let message):
            unavailable(title: "Something went wrong", symbol: "exclamationmark.triangle", message: message) {
                await model.retry()
            }
        case .joining:
            ContentUnavailableView {
                Label("Joining your team…", systemImage: "person.2")
            } description: {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Your business is syncing from iCloud. This can take a minute.")
                }
            } actions: {
                Button("Try Again") { Task { await model.retry() } }
                    .buttonStyle(.brandProminent)
            }
        case .loaded:
            switch model.role {
            case .needsSetup: WelcomeView { isCreatingBusiness = true }
            case .manager: ManagerHomeView(model: model)
            case .employee: EmployeeHomeView(model: model)
            }
        }
    }

    private func unavailable(
        title: String, symbol: String, message: String,
        action: @escaping @MainActor @Sendable () async -> Void
    ) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") { Task { await action() } }
                .buttonStyle(.brandProminent)
        }
    }
}
