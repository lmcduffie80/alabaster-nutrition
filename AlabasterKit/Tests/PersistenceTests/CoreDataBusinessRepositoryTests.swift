import CoreData
import Domain
import Foundation
import Testing
@testable import Persistence

struct CoreDataBusinessRepositoryTests {
    let anchor = Date(timeIntervalSince1970: 1_793_000_000)

    func makeRepository() throws -> (CoreDataBusinessRepository, PersistenceController) {
        let controller = try PersistenceController(mode: .inMemory)
        let clock = StepClock(start: anchor)
        return (CoreDataBusinessRepository(controller: controller, now: { clock() }), controller)
    }

    func draft() -> BusinessDraft {
        .alabasterDefaults(ownerName: "Owner", payPeriodAnchor: anchor)
    }

    @Test func noBusinessMeansNoMembership() async throws {
        let (repository, _) = try makeRepository()
        #expect(try await repository.membership() == .none)
    }

    @Test func creatingABusinessMakesTheUserItsOwner() async throws {
        let (repository, _) = try makeRepository()
        let created = try await repository.createBusiness(from: draft())

        #expect(created.name == "Alabaster Nutrition")
        #expect(created.timeZoneIdentifier == "America/New_York")
        #expect(created.payPeriodRule == .weekly)
        #expect(created.payPeriodAnchor == anchor)
        #expect(created.missingClockOutHours == 12)
        #expect(created.kioskAutoReturnSeconds == 10)
        #expect(try await repository.membership() == .owner(created))
    }

    @Test func timeClockSettingsRoundTrip() async throws {
        let (repository, _) = try makeRepository()
        var custom = draft()
        custom.missingClockOutHours = 8
        custom.kioskAutoReturnSeconds = 30

        let created = try await repository.createBusiness(from: custom)

        #expect(created.missingClockOutHours == 8)
        #expect(created.kioskAutoReturnSeconds == 30)
        guard case .owner(let fetched) = try await repository.membership() else {
            Issue.record("Expected owner")
            return
        }
        #expect(fetched.missingClockOutHours == 8)
        #expect(fetched.kioskAutoReturnSeconds == 30)
    }

    @Test func aBusinessWithoutTimeClockSettingsUsesTheDefaults() async throws {
        let (repository, controller) = try makeRepository()
        let context = controller.newBackgroundContext()
        try await context.perform {
            let object = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(object, to: controller.privateStore)
            object.setValue(UUID(), forKey: "id")
            object.setValue(nil, forKey: "missingClockOutHours")
            object.setValue(nil, forKey: "kioskAutoReturnSeconds")
            object.setValue(Date(), forKey: "createdAt")
            try context.save()
        }

        let business = try #require(try await repository.membership().business)
        #expect(business.missingClockOutHours == BusinessDraft.defaultMissingClockOutHours)
        #expect(business.kioskAutoReturnSeconds == BusinessDraft.defaultKioskAutoReturnSeconds)
    }

    @Test func creatingABusinessAddsTheOwnerAsManager() async throws {
        let (repository, _) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        let employees = try await repository.employees()
        #expect(employees.count == 1)
        #expect(employees.first?.displayName == "Owner")
        #expect(employees.first?.role == .manager)
        #expect(employees.first?.colorIndex == 0)
        #expect(employees.first?.participantRecordName == nil)
    }

    @Test func aSecondBusinessIsRejected() async throws {
        let (repository, _) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        await #expect(throws: BusinessRepositoryError.businessAlreadyExists) {
            try await repository.createBusiness(from: draft())
        }
    }

    @Test func anInvalidDraftIsRejected() async throws {
        let (repository, _) = try makeRepository()
        var invalid = draft()
        invalid.name = ""

        await #expect(throws: BusinessRepositoryError.invalidDraft([.emptyName])) {
            try await repository.createBusiness(from: invalid)
        }
    }

    @Test func aBusinessSharedWithTheUserMeansMembership() async throws {
        let (repository, controller) = try makeRepository()
        let context = controller.newBackgroundContext()
        try await context.perform {
            let object = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(object, to: controller.sharedStore)
            object.setValue(UUID(), forKey: "id")
            object.setValue("Alabaster Nutrition", forKey: "name")
            object.setValue(Date(), forKey: "createdAt")
            try context.save()
        }

        guard case .member(let business) = try await repository.membership() else {
            Issue.record("Expected member")
            return
        }
        #expect(business.name == "Alabaster Nutrition")
    }

    @Test func aMemberCannotCreateABusiness() async throws {
        let (repository, controller) = try makeRepository()
        let context = controller.newBackgroundContext()
        try await context.perform {
            let object = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(object, to: controller.sharedStore)
            object.setValue(UUID(), forKey: "id")
            object.setValue("Alabaster Nutrition", forKey: "name")
            object.setValue(Date(), forKey: "createdAt")
            try context.save()
        }

        await #expect(throws: BusinessRepositoryError.businessAlreadyExists) {
            try await repository.createBusiness(from: draft())
        }
    }

    @Test func namesAreTrimmedWhenStored() async throws {
        let (repository, _) = try makeRepository()
        var padded = draft()
        padded.name = "  Alabaster Nutrition "
        padded.ownerName = " Owner "

        let created = try await repository.createBusiness(from: padded)

        #expect(created.name == "Alabaster Nutrition")
        #expect(try await repository.employees().first?.displayName == "Owner")
    }

    @Test func employeesAreScopedToTheEarliestBusiness() async throws {
        let (repository, controller) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        let context = controller.newBackgroundContext()
        let later = anchor.addingTimeInterval(3_600)
        try await context.perform {
            let business = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(business, to: controller.privateStore)
            business.setValue(UUID(), forKey: "id")
            business.setValue("Duplicate", forKey: "name")
            business.setValue(later, forKey: "createdAt")

            let employee = NSEntityDescription.insertNewObject(forEntityName: EntityName.employee, into: context)
            context.assign(employee, to: controller.privateStore)
            employee.setValue(UUID(), forKey: "id")
            employee.setValue("Stranger", forKey: "displayName")
            employee.setValue(later, forKey: "createdAt")
            employee.setValue(business, forKey: "business")
            try context.save()
        }

        let employees = try await repository.employees()
        #expect(employees.map(\.displayName) == ["Owner"])
    }

    @Test func employeesAddedOnTwoDevicesCollapseToTheEarliest() async throws {
        let (repository, controller) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        let context = controller.newBackgroundContext()
        let earlierID = UUID()
        try await context.perform {
            guard let business = try context.fetchBusinessObject() else { return }
            for (id, offset) in [(UUID(), 7_200.0), (earlierID, 3_600.0)] {
                let employee = NSEntityDescription.insertNewObject(forEntityName: EntityName.employee, into: context)
                context.assign(employee, to: controller.privateStore)
                employee.setValue(id, forKey: "id")
                employee.setValue("Jordan Lee", forKey: "displayName")
                employee.setValue(EmployeeRole.employee.rawValue, forKey: "role")
                employee.setValue("_a", forKey: "participantRecordName")
                employee.setValue(anchor.addingTimeInterval(offset), forKey: "createdAt")
                employee.setValue(business, forKey: "business")
            }
            try context.save()
        }

        let employees = try await repository.employees()
        #expect(employees.map(\.participantRecordName) == [nil, "_a"])
        #expect(employees.last?.id == earlierID)

        try await repository.addEmployees([
            NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
        ])
        #expect(try await repository.employees().count == 2)
    }

    @Test func theOwnerCanAddEmployees() async throws {
        let (repository, _) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        try await repository.addEmployees([
            NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
        ])

        let employees = try await repository.employees()
        #expect(employees.map(\.displayName) == ["Owner", "Jordan Lee"])
        #expect(employees.last?.role == .employee)
        #expect(employees.last?.colorIndex == 1)
        #expect(employees.last?.participantRecordName == "_a")
    }

    @Test func addingEmployeesWithoutABusinessFails() async throws {
        let (repository, _) = try makeRepository()
        await #expect(throws: BusinessRepositoryError.noBusiness) {
            try await repository.addEmployees([
                NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
            ])
        }
    }

    @Test func membersCannotAddEmployees() async throws {
        let (repository, controller) = try makeRepository()
        let context = controller.newBackgroundContext()
        try await context.perform {
            let object = NSEntityDescription.insertNewObject(forEntityName: EntityName.business, into: context)
            context.assign(object, to: controller.sharedStore)
            object.setValue(UUID(), forKey: "id")
            object.setValue(Date(), forKey: "createdAt")
            try context.save()
        }

        await #expect(throws: BusinessRepositoryError.notOwner) {
            try await repository.addEmployees([
                NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
            ])
        }
    }

    @Test func addedEmployeeNamesAreTrimmed() async throws {
        let (repository, _) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        try await repository.addEmployees([
            NewEmployee(displayName: "  Jordan Lee\n", participantRecordName: "_a", colorIndex: 1),
        ])

        #expect(try await repository.employees().last?.displayName == "Jordan Lee")
    }

    @Test func participantsAlreadyAddedAreSkipped() async throws {
        let (repository, _) = try makeRepository()
        _ = try await repository.createBusiness(from: draft())

        try await repository.addEmployees([
            NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
        ])
        try await repository.addEmployees([
            NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1),
            NewEmployee(displayName: "Sam Rivera", participantRecordName: "_b", colorIndex: 2),
            NewEmployee(displayName: "Sam Rivera", participantRecordName: "_b", colorIndex: 2),
        ])

        let employees = try await repository.employees()
        #expect(employees.map(\.displayName) == ["Owner", "Jordan Lee", "Sam Rivera"])
        #expect(employees.map(\.participantRecordName) == [nil, "_a", "_b"])
    }
}
