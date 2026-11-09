import CloudKit
import Features
import Persistence
import Sharing

@MainActor
final class AppServices {
    static let shared = AppServices()
    static let containerIdentifier = "iCloud.com.alabasternutrition.schedule"

    let persistence: PersistenceController
    let sharing: CloudKitBusinessSharing
    let model: AppModel

    private init() {
        do {
            persistence = try PersistenceController(mode: .cloudKit(containerIdentifier: Self.containerIdentifier))
        } catch {
            fatalError("Could not open the local database: \(error)")
        }
        sharing = CloudKitBusinessSharing(controller: persistence, containerIdentifier: Self.containerIdentifier)
        model = AppModel(repository: CoreDataBusinessRepository(controller: persistence), sharing: sharing)

        #if DEBUG
        if CommandLine.arguments.contains("-initializeCloudKitSchema") {
            do {
                try persistence.initializeCloudKitSchema()
                print("CloudKit schema initialized")
            } catch {
                print("CloudKit schema initialization failed: \(error)")
            }
        }
        #endif
    }

    func accept(_ metadata: CKShare.Metadata) {
        Task {
            await model.acceptInvitation { [sharing] in try await sharing.acceptInvitation(metadata) }
        }
    }
}
