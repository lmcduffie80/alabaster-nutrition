import CloudKit
import CoreData
import Domain
import Persistence

public enum SharingError: Error {
    case noBusiness
    case notCloudKitContainer
}

public final class CloudKitBusinessSharing: BusinessSharing, @unchecked Sendable {
    private let controller: PersistenceController
    private let containerIdentifier: String

    public init(controller: PersistenceController, containerIdentifier: String) {
        self.controller = controller
        self.containerIdentifier = containerIdentifier
    }

    private var cloudContainer: NSPersistentCloudKitContainer? {
        controller.container as? NSPersistentCloudKitContainer
    }

    public func isICloudAvailable() async -> Bool {
        (try? await CKContainer(identifier: containerIdentifier).accountStatus()) == .available
    }

    public func shareItem() -> BusinessShareItem {
        BusinessShareItem(containerIdentifier: containerIdentifier) { [self] in
            try await existingOrNewShare()
        }
    }

    public func acceptedParticipants() async throws -> [ShareParticipantInfo] {
        guard let share = try await currentShare() else { return [] }
        let formatter = PersonNameComponentsFormatter()
        return share.participants.compactMap { participant in
            guard participant.role != .owner,
                  participant.acceptanceStatus == .accepted,
                  let recordName = participant.userIdentity.userRecordID?.recordName else { return nil }
            let name = participant.userIdentity.nameComponents.map { formatter.string(from: $0) } ?? ""
            return ShareParticipantInfo(recordName: recordName, displayName: name)
        }
    }

    /// Called from the app delegates when the user opens an invite link.
    public func acceptInvitation(_ metadata: CKShare.Metadata) async throws {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        _ = try await cloudContainer.acceptShareInvitations(from: [metadata], into: controller.sharedStore)
    }

    @MainActor
    private func currentShare() throws -> CKShare? {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        guard let business = try cloudContainer.viewContext.fetchBusinessObject() else { return nil }
        return try cloudContainer.fetchShares(matching: [business.objectID])[business.objectID]
    }

    @MainActor
    private func existingOrNewShare() async throws -> CKShare {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        guard let business = try cloudContainer.viewContext.fetchBusinessObject() else {
            throw SharingError.noBusiness
        }
        if let existing = try currentShare() { return existing }

        let (_, share, _) = try await cloudContainer.share([business], to: nil)
        let name = business.value(forKey: "name") as? String ?? "Alabaster Nutrition"
        share[CKShare.SystemFieldKey.title] = name as CKRecordValue
        share.publicPermission = .none
        _ = try await cloudContainer.persistUpdatedShare(share, in: controller.privateStore)
        return share
    }
}
