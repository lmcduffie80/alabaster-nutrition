import CoreData
import Domain
import Foundation
import Testing
@testable import Persistence

struct CoreDataBusinessRepositoryTests {
    let anchor = Date(timeIntervalSince1970: 1_793_000_000)

    func makeRepository() throws -> (CoreDataBusinessRepository, PersistenceController) {
        let controller = try PersistenceController(mode: .inMemory)
        return (CoreDataBusinessRepository(controller: controller), controller)
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
        #expect(created.workplace == Coordinate(latitude: 31.5296, longitude: -83.8354))
        #expect(created.allowedRadiusMeters == 150)
        #expect(created.missingClockOutHours == 12)
        #expect(try await repository.membership() == .owner(created))
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
        try await context.perform {
            let later = Date().addingTimeInterval(3_600)
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
}
