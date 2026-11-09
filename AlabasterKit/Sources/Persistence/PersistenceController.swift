import CloudKit
import CoreData

public enum PersistenceError: LocalizedError {
    case storeMissing

    public var errorDescription: String? {
        switch self {
        case .storeMissing: "The app's data couldn't be opened. Restart the app and try again."
        }
    }
}

public final class PersistenceController: @unchecked Sendable {
    public enum Mode: Sendable {
        case inMemory
        case cloudKit(containerIdentifier: String)
    }

    public let container: NSPersistentContainer
    /// Zones the current user owns.
    public let privateStore: NSPersistentStore
    /// Zones other people shared with the current user.
    public let sharedStore: NSPersistentStore

    public init(mode: Mode) throws {
        let container: NSPersistentContainer
        let privateDescription: NSPersistentStoreDescription
        let sharedDescription: NSPersistentStoreDescription

        switch mode {
        case .inMemory:
            container = NSPersistentContainer(name: "Alabaster", managedObjectModel: AlabasterModel.shared)
            privateDescription = Self.inMemoryDescription(named: "private")
            sharedDescription = Self.inMemoryDescription(named: "shared")
        case .cloudKit(let identifier):
            container = NSPersistentCloudKitContainer(name: "Alabaster", managedObjectModel: AlabasterModel.shared)
            privateDescription = Self.cloudKitDescription(named: "private", scope: .private, containerIdentifier: identifier)
            sharedDescription = Self.cloudKitDescription(named: "shared", scope: .shared, containerIdentifier: identifier)
        }

        container.persistentStoreDescriptions = [privateDescription, sharedDescription]
        var loadError: Error?
        container.loadPersistentStores { _, error in
            if let error { loadError = error }
        }
        if let loadError { throw loadError }

        let coordinator = container.persistentStoreCoordinator
        guard let privateURL = privateDescription.url,
              let sharedURL = sharedDescription.url,
              let privateStore = coordinator.persistentStore(for: privateURL),
              let sharedStore = coordinator.persistentStore(for: sharedURL) else {
            throw PersistenceError.storeMissing
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        self.container = container
        self.privateStore = privateStore
        self.sharedStore = sharedStore
    }

    public func newBackgroundContext() -> NSManagedObjectContext {
        let context = container.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        return context
    }

    /// Debug-only: pushes the record types to the CloudKit development environment.
    public func initializeCloudKitSchema() throws {
        try (container as? NSPersistentCloudKitContainer)?.initializeCloudKitSchema(options: [])
    }

    private static func inMemoryDescription(named name: String) -> NSPersistentStoreDescription {
        let description = NSPersistentStoreDescription(url: URL(fileURLWithPath: "/dev/null").appendingPathComponent(name))
        description.type = NSInMemoryStoreType
        description.shouldAddStoreAsynchronously = false
        return description
    }

    private static func cloudKitDescription(
        named name: String,
        scope: CKDatabase.Scope,
        containerIdentifier: String
    ) -> NSPersistentStoreDescription {
        let url = NSPersistentContainer.defaultDirectoryURL().appendingPathComponent("Alabaster-\(name).sqlite")
        let description = NSPersistentStoreDescription(url: url)
        let options = NSPersistentCloudKitContainerOptions(containerIdentifier: containerIdentifier)
        options.databaseScope = scope
        description.cloudKitContainerOptions = options
        description.shouldAddStoreAsynchronously = false
        description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
        description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)
        return description
    }
}
