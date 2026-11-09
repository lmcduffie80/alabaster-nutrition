import Domain
import Foundation
import Persistence
import Testing
@testable import Features

@MainActor
struct AppModelTests {
    func ownerModel() async -> (AppModel, FakeBusinessRepository) {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.owner(Sample.business), employees: [Sample.owner])
        let model = AppModel(repository: repository, accountStatus: FakeAccountStatus())
        await model.refresh()
        return (model, repository)
    }

    @Test func withNoBusinessTheUserNeedsSetup() async {
        let model = AppModel(repository: FakeBusinessRepository(), accountStatus: FakeAccountStatus())
        await model.refresh()
        #expect(model.loadState == .loaded)
        #expect(model.role == .needsSetup)
    }

    @Test func withoutICloudTheModelSaysSo() async {
        let model = AppModel(repository: FakeBusinessRepository(), accountStatus: FakeAccountStatus(available: false))
        await model.refresh()
        #expect(model.loadState == .iCloudUnavailable)
    }

    @Test func creatingABusinessMakesTheUserManager() async throws {
        let model = AppModel(repository: FakeBusinessRepository(), accountStatus: FakeAccountStatus())
        try await model.createBusiness(.alabasterDefaults(ownerName: "Owner", payPeriodAnchor: .now))
        #expect(model.role == .manager)
        #expect(model.employees.map(\.displayName) == ["Owner"])
    }

    @Test func theOwnerCanAddAnEmployeeByName() async throws {
        let (model, repository) = await ownerModel()
        try await model.addEmployee(named: " Jordan Lee ")

        #expect(await repository.added == [NewEmployee(displayName: "Jordan Lee", colorIndex: 1)])
        #expect(model.employees.map(\.displayName) == ["Owner", "Jordan Lee"])
    }

    @Test func duplicateNamesAreRejectedBeforeSaving() async {
        let (model, repository) = await ownerModel()
        await #expect(throws: EmployeeNameError.duplicate) {
            try await model.addEmployee(named: "owner")
        }
        #expect(await repository.added.isEmpty)
    }

    @Test func employeesCannotAddTeammates() async {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.member(Sample.business), employees: [Sample.owner])
        let model = AppModel(repository: repository, accountStatus: FakeAccountStatus())
        await model.refresh()

        #expect(model.role == .employee)
        await #expect(throws: BusinessRepositoryError.notOwner) {
            try await model.addEmployee(named: "Jordan Lee")
        }
    }

    @Test func showErrorSetsFailedState() {
        let model = AppModel(repository: FakeBusinessRepository(), accountStatus: FakeAccountStatus())
        model.showError("The team couldn't be loaded.")
        #expect(model.loadState == .failed("The team couldn't be loaded."))
    }
}
