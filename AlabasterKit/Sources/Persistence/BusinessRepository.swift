import Domain
import Foundation

public enum BusinessRepositoryError: LocalizedError, Equatable {
    case invalidDraft([BusinessDraftError])
    case businessAlreadyExists
    case noBusiness
    case notOwner

    public var errorDescription: String? {
        switch self {
        case .invalidDraft(let errors): errors.map(\.message).joined(separator: " ")
        case .businessAlreadyExists: "This Apple Account already has a business."
        case .noBusiness: "Set up your business first."
        case .notOwner: "Only the business owner can do that."
        }
    }
}

public protocol BusinessRepository: Sendable {
    func membership() async throws -> Membership
    func createBusiness(from draft: BusinessDraft) async throws -> Business
    func employees() async throws -> [Employee]
    func addEmployees(_ newEmployees: [NewEmployee]) async throws
}
