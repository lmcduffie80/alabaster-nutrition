import Domain

public enum BusinessRepositoryError: Error, Equatable {
    case invalidDraft([BusinessDraftError])
    case businessAlreadyExists
    case noBusiness
    case notOwner
}

public protocol BusinessRepository: Sendable {
    func membership() async throws -> Membership
    func createBusiness(from draft: BusinessDraft) async throws -> Business
    func employees() async throws -> [Employee]
    func addEmployees(_ newEmployees: [NewEmployee]) async throws
}
