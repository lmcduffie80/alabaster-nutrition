import Features
import Persistence

@MainActor
final class AppServices {
    static let shared = AppServices()
    static let containerIdentifier = "iCloud.com.alabasternutrition.schedule"

    let persistence: PersistenceController
    let model: AppModel

    private init() {
        do {
            persistence = try PersistenceController(mode: .cloudKit(containerIdentifier: Self.containerIdentifier))
        } catch {
            fatalError("Could not open the local database: \(error)")
        }
        model = AppModel(
            repository: CoreDataBusinessRepository(controller: persistence),
            accountStatus: CloudKitAccountStatus(containerIdentifier: Self.containerIdentifier)
        )

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
}
