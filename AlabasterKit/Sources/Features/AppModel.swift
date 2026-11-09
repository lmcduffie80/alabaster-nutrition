import Domain
import Observation
import Persistence
import Sharing

@MainActor
@Observable
public final class AppModel {
    public enum LoadState: Equatable, Sendable {
        case loading
        case loaded
        case joining
        case iCloudUnavailable
        case failed(String)
    }

    public private(set) var loadState: LoadState = .loading
    public private(set) var membership: Membership = .none
    public private(set) var employees: [Employee] = []

    public var role: AppRole { membership.role }

    private let repository: any BusinessRepository
    private let sharing: any BusinessSharing
    private var runningRefresh: Task<Void, Never>?
    private var refreshRequested = false
    private var isJoining = false

    public init(repository: any BusinessRepository, sharing: any BusinessSharing) {
        self.repository = repository
        self.sharing = sharing
    }

    /// Runs one refresh at a time, so two owner refreshes cannot both add the same participant.
    /// Calls that arrive mid-refresh coalesce into a single follow-up run and return once it finishes.
    public func refresh() async {
        if let runningRefresh {
            refreshRequested = true
            await runningRefresh.value
            return
        }
        let task = Task {
            repeat {
                refreshRequested = false
                await performRefresh()
            } while refreshRequested
            runningRefresh = nil
        }
        runningRefresh = task
        await task.value
    }

    private func performRefresh() async {
        guard await sharing.isICloudAvailable() else {
            loadState = .iCloudUnavailable
            return
        }
        do {
            membership = try await repository.membership()
            if case .owner = membership {
                try await reconcileParticipants()
            }
            employees = membership.business == nil ? [] : try await repository.employees()
            if membership != .none {
                isJoining = false
            }
            loadState = isJoining ? .joining : .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    public func createBusiness(_ draft: BusinessDraft) async throws {
        _ = try await repository.createBusiness(from: draft)
        await refresh()
    }

    /// Accepts an invite, then stays in `.joining` until the shared business syncs down,
    /// so the new employee is not sent to business setup in the meantime.
    public func acceptInvitation(_ accept: @escaping @Sendable () async throws -> Void) async {
        isJoining = true
        loadState = .joining
        do {
            try await accept()
        } catch {
            isJoining = false
            showError("The invite couldn't be accepted: \(error.localizedDescription)")
            return
        }
        await refresh()
    }

    public func shareItem() -> BusinessShareItem? {
        guard case .owner = membership else { return nil }
        return sharing.shareItem()
    }

    public func showError(_ message: String) {
        loadState = .failed(message)
    }

    private func reconcileParticipants() async throws {
        let participants = try await sharing.acceptedParticipants()
        let newEmployees = ParticipantReconciler.newEmployees(
            acceptedParticipants: participants,
            existing: try await repository.employees()
        )
        if !newEmployees.isEmpty {
            try await repository.addEmployees(newEmployees)
        }
    }
}
