import Domain

public protocol BusinessSharing: Sendable {
    func isICloudAvailable() async -> Bool
    /// Accepted, non-owner participants of the Business zone share. Empty when there is no share yet.
    func acceptedParticipants() async throws -> [ShareParticipantInfo]
    func shareItem() -> BusinessShareItem
}
