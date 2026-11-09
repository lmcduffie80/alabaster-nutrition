import Domain
import Observation
import Persistence

@MainActor
@Observable
public final class AppModel {
    public enum LoadState: Equatable, Sendable {
        case loading
        case loaded
        case iCloudUnavailable
        case failed(String)
    }

    public private(set) var loadState: LoadState = .loading
    public private(set) var membership: Membership = .none
    public private(set) var employees: [Employee] = []

    public var role: AppRole { membership.role }

    private let repository: any BusinessRepository
    private let accountStatus: any CloudAccountStatus

    public init(repository: any BusinessRepository, accountStatus: any CloudAccountStatus) {
        self.repository = repository
        self.accountStatus = accountStatus
    }

    public func refresh() async {
        guard await accountStatus.isAvailable() else {
            loadState = .iCloudUnavailable
            return
        }
        do {
            membership = try await repository.membership()
            employees = membership.business == nil ? [] : try await repository.employees()
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    public func createBusiness(_ draft: BusinessDraft) async throws {
        _ = try await repository.createBusiness(from: draft)
        await refresh()
    }

    /// Throws `EmployeeNameError` for a blank or duplicate name, and
    /// `BusinessRepositoryError.notOwner` when called on an employee's device.
    public func addEmployee(named name: String) async throws {
        guard case .owner = membership else { throw BusinessRepositoryError.notOwner }
        let newEmployee = try TeamRoster.newEmployee(named: name, existing: employees)
        try await repository.addEmployees([newEmployee])
        employees = try await repository.employees()
    }

    public func showError(_ message: String) {
        loadState = .failed(message)
    }
}
