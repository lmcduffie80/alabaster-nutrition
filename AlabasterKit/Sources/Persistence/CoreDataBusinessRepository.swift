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
        let controller = controller
        let context = controller.newBackgroundContext()
        return try await context.perform {
            guard let object = try context.fetchBusinessObject() else { return .none }
            let business = Mapping.business(from: object)
            return object.objectID.persistentStore === controller.privateStore ? .owner(business) : .member(business)
        }
    }

    /// The duplicate check only sees data already synced to this device. A new device that runs this before its
    /// initial CloudKit import finishes can create a second business; the earliest `createdAt` wins and
    /// `employees()` is scoped to it.
    public func createBusiness(from draft: BusinessDraft) async throws -> Business {
        let errors = draft.validationErrors()
        guard errors.isEmpty else { throw BusinessRepositoryError.invalidDraft(errors) }

        let controller = controller
        let context = controller.newBackgroundContext()
        let createdAt = now()
        return try await context.perform {
            if try context.fetchBusinessObject() != nil {
                throw BusinessRepositoryError.businessAlreadyExists
            }

            let privateStore = controller.privateStore
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
        let context = controller.newBackgroundContext()
        return try await context.perform {
            guard let business = try context.fetchBusinessObject() else { return [] }
            return try context.fetchEmployeeObjects(for: business).map(Mapping.employee(from:))
        }
    }

    public func addEmployees(_ newEmployees: [NewEmployee]) async throws {
        guard !newEmployees.isEmpty else { return }
        let controller = controller
        let context = controller.newBackgroundContext()
        let now = now
        try await context.perform {
            guard let business = try context.fetchBusinessObject() else {
                throw BusinessRepositoryError.noBusiness
            }
            let privateStore = controller.privateStore
            guard business.objectID.persistentStore === privateStore else {
                throw BusinessRepositoryError.notOwner
            }
            var knownParticipants = Set(
                try context.fetchEmployeeObjects(for: business)
                    .compactMap { $0.value(forKey: "participantRecordName") as? String }
            )
            for newEmployee in newEmployees {
                guard knownParticipants.insert(newEmployee.participantRecordName).inserted else { continue }
                let employee = NSEntityDescription.insertNewObject(forEntityName: EntityName.employee, into: context)
                context.assign(employee, to: privateStore)
                employee.setValue(UUID(), forKey: "id")
                employee.setValue(newEmployee.displayName.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "displayName")
                employee.setValue(EmployeeRole.employee.rawValue, forKey: "role")
                employee.setValue(newEmployee.colorIndex, forKey: "colorIndex")
                employee.setValue(true, forKey: "isActive")
                employee.setValue(newEmployee.participantRecordName, forKey: "participantRecordName")
                employee.setValue(now(), forKey: "createdAt")
                employee.setValue(business, forKey: "business")
            }
            try context.save()
        }
    }
}
