import CloudKit

public protocol CloudAccountStatus: Sendable {
    func isAvailable() async -> Bool
}

public struct CloudKitAccountStatus: CloudAccountStatus {
    private let containerIdentifier: String

    public init(containerIdentifier: String) {
        self.containerIdentifier = containerIdentifier
    }

    public func isAvailable() async -> Bool {
        (try? await CKContainer(identifier: containerIdentifier).accountStatus()) == .available
    }
}
