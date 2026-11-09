import CoreData
import Domain
import Foundation

public final class CoreDataBusinessRepository: BusinessRepository, @unchecked Sendable {
    private let controller: PersistenceController
    private let now: @Sendable () -> Date

    public init(controller: PersistenceController, now: @escaping @Sendable () -> Date = { Date() }) {
        self.controller = controller
        self.now = now
    }

    public func membership() async throws -> Membership {
        let context = controller.container.newBackgroundContext()
        let privateStore = controller.privateStore
        return try await context.perform {
            guard let object = try context.fetchBusinessObject() else { return .none }
            let business = Mapping.business(from: object)
            return object.objectID.persistentStore === privateStore ? .owner(business) : .member(business)
        }
    }

    public func createBusiness(from draft: BusinessDraft) async throws -> Business {
        let errors = draft.validationErrors()
        guard errors.isEmpty else { throw BusinessRepositoryError.invalidDraft(errors) }

        let context = controller.container.newBackgroundContext()
        let privateStore = controller.privateStore
        let createdAt = now()
        return try await context.perform {
            if try context.fetchBusinessObject() != nil {
                throw BusinessRepositoryError.businessAlreadyExists
            }

            let business = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(business, to: privateStore)
            business.setValue(UUID(), forKey: "id")
            business.setValue(draft.name.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "name")
            business.setValue(draft.timeZoneIdentifier, forKey: "timeZoneIdentifier")
            business.setValue(draft.payPeriodRule.rawValue, forKey: "payPeriodRule")
            business.setValue(draft.payPeriodAnchor, forKey: "payPeriodAnchor")
            business.setValue(draft.workplace.latitude, forKey: "workplaceLatitude")
            business.setValue(draft.workplace.longitude, forKey: "workplaceLongitude")
            business.setValue(draft.allowedRadiusMeters, forKey: "allowedRadiusMeters")
            business.setValue(draft.missingClockOutHours, forKey: "missingClockOutHours")
            business.setValue(createdAt, forKey: "createdAt")

            let owner = NSEntityDescription.insertNewObject(forEntityName: EntityName.employee, into: context)
            context.assign(owner, to: privateStore)
            owner.setValue(UUID(), forKey: "id")
            owner.setValue(draft.ownerName.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "displayName")
            owner.setValue(EmployeeRole.manager.rawValue, forKey: "role")
            owner.setValue(0, forKey: "colorIndex")
            owner.setValue(true, forKey: "isActive")
            owner.setValue(createdAt, forKey: "createdAt")
            owner.setValue(business, forKey: "business")

            try context.save()
            return Mapping.business(from: business)
        }
    }

    public func employees() async throws -> [Employee] {
        let context = controller.container.newBackgroundContext()
        return try await context.perform {
            try context.fetchEmployeeObjects().map(Mapping.employee(from:))
        }
    }

    public func addEmployees(_ newEmployees: [NewEmployee]) async throws {
        throw BusinessRepositoryError.noBusiness
    }
}
