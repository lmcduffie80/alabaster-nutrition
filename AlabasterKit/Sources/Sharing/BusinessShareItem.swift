import CloudKit
import CoreTransferable

/// Hands a lazily created `CKShare` to `ShareLink`, which shows the system invite sheet.
public struct BusinessShareItem: Transferable, Sendable {
    public let containerIdentifier: String
    public let makeShare: @Sendable () async throws -> CKShare

    public init(containerIdentifier: String, makeShare: @escaping @Sendable () async throws -> CKShare) {
        self.containerIdentifier = containerIdentifier
        self.makeShare = makeShare
    }

    public static var transferRepresentation: some TransferRepresentation {
        CKShareTransferRepresentation { item in
            .prepareShare(
                container: CKContainer(identifier: item.containerIdentifier),
                allowedSharingOptions: CKAllowedSharingOptions(
                    allowedParticipantPermissionOptions: .readOnly,
                    allowedParticipantAccessOptions: .specifiedRecipientsOnly
                )
            ) {
                try await item.makeShare()
            }
        }
    }
}
