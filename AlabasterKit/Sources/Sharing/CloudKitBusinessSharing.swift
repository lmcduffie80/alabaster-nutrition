import CloudKit
import CoreData
import Domain
import Foundation
import os
import Persistence

public enum SharingError: LocalizedError {
    case noBusiness
    case notCloudKitContainer
    case notOwner

    public var errorDescription: String? {
        switch self {
        case .noBusiness: "Set up your business before inviting people."
        case .notCloudKitContainer: "Sharing needs iCloud."
        case .notOwner: "Only the business owner can invite people."
        }
    }
}

public final class CloudKitBusinessSharing: BusinessSharing, @unchecked Sendable {
    private let controller: PersistenceController
    private let containerIdentifier: String
    @MainActor private var pendingShare: Task<CKShare, Error>?

    public init(controller: PersistenceController, containerIdentifier: String) {
        self.controller = controller
        self.containerIdentifier = containerIdentifier
    }

    private var cloudContainer: NSPersistentCloudKitContainer? {
        controller.container as? NSPersistentCloudKitContainer
    }

    public func isICloudAvailable() async -> Bool {
        do {
            let status = try await CKContainer(identifier: containerIdentifier).accountStatus()
            if status != .available {
                Logger.sharing.notice("iCloud account status is \(status.rawValue, privacy: .public), not available")
            }
            return status == .available
        } catch {
            Logger.sharing.error("iCloud account status check failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    public func shareItem() -> BusinessShareItem {
        BusinessShareItem(containerIdentifier: containerIdentifier) { [self] in
            do {
                return try await existingOrNewShare()
            } catch {
                Logger.sharing.error("Share creation failed: \(error.localizedDescription, privacy: .public)")
                throw error
            }
        }
    }

    public func acceptedParticipants() async throws -> [ShareParticipantInfo] {
        guard let share = try await currentShare() else { return [] }
        let formatter = PersonNameComponentsFormatter()
        return share.participants.compactMap { participant in
            guard participant.role != .owner,
                  participant.acceptanceStatus == .accepted,
                  let recordName = participant.userIdentity.userRecordID?.recordName else { return nil }
            let identity = participant.userIdentity
            var name = identity.nameComponents.map { formatter.string(from: $0) } ?? ""
            if name.isEmpty {
                name = identity.lookupInfo?.emailAddress ?? identity.lookupInfo?.phoneNumber ?? ""
            }
            return ShareParticipantInfo(recordName: recordName, displayName: name)
        }
    }

    /// Called from the app delegates when the user opens an invite link.
    public func acceptInvitation(_ metadata: CKShare.Metadata) async throws {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        _ = try await cloudContainer.acceptShareInvitations(from: [metadata], into: controller.sharedStore)
    }

    /// The Business zone share, or nil when there is none yet or the current user is a member rather than the owner.
    @MainActor
    private func currentShare() throws -> CKShare? {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        guard let business = try cloudContainer.viewContext.fetchBusinessObject(),
              business.objectID.persistentStore === controller.privateStore else { return nil }
        return try cloudContainer.fetchShares(matching: [business.objectID])[business.objectID]
    }

    /// Concurrent callers share one in-flight request so a double tap cannot create two shares.
    @MainActor
    private func existingOrNewShare() async throws -> CKShare {
        if let pendingShare { return try await pendingShare.value }
        let task = Task { @MainActor in try await self.makeShareIfNeeded() }
        pendingShare = task
        defer { pendingShare = nil }
        return try await task.value
    }

    @MainActor
    private func makeShareIfNeeded() async throws -> CKShare {
        guard let cloudContainer else { throw SharingError.notCloudKitContainer }
        guard let business = try cloudContainer.viewContext.fetchBusinessObject() else {
            throw SharingError.noBusiness
        }
        guard business.objectID.persistentStore === controller.privateStore else {
            throw SharingError.notOwner
        }
        if let existing = try currentShare() { return existing }

        let (_, share, _) = try await cloudContainer.share([business], to: nil)
        let name = business.value(forKey: "name") as? String ?? "Alabaster Nutrition"
        share[CKShare.SystemFieldKey.title] = name as CKRecordValue
        share.publicPermission = .none
        return try await cloudContainer.persistUpdatedShare(share, in: controller.privateStore)
    }
}
