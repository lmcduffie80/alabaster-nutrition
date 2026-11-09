import Domain
import Foundation
import Testing
@testable import Features

@MainActor
struct AppModelTests {
    @Test func withNoBusinessTheUserNeedsSetup() async {
        let model = AppModel(repository: FakeBusinessRepository(), sharing: FakeSharing())
        await model.refresh()
        #expect(model.loadState == .loaded)
        #expect(model.role == .needsSetup)
    }

    @Test func withoutICloudTheModelSaysSo() async {
        let sharing = FakeSharing()
        sharing.iCloudAvailable = false
        let model = AppModel(repository: FakeBusinessRepository(), sharing: sharing)
        await model.refresh()
        #expect(model.loadState == .iCloudUnavailable)
    }

    @Test func creatingABusinessMakesTheUserManager() async throws {
        let model = AppModel(repository: FakeBusinessRepository(), sharing: FakeSharing())
        try await model.createBusiness(.alabasterDefaults(ownerName: "Owner", payPeriodAnchor: .now))
        #expect(model.role == .manager)
        #expect(model.employees.map(\.displayName) == ["Owner"])
    }

    @Test func ownerRefreshAddsNewlyAcceptedParticipants() async {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.owner(Sample.business), employees: [Sample.owner])
        let sharing = FakeSharing()
        sharing.participants = [ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee")]

        let model = AppModel(repository: repository, sharing: sharing)
        await model.refresh()

        #expect(await repository.added == [NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1)])
        #expect(model.employees.map(\.displayName) == ["Owner", "Jordan Lee"])
    }

    @Test func memberRefreshDoesNotReconcile() async {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.member(Sample.business), employees: [Sample.owner])
        let sharing = FakeSharing()

        let model = AppModel(repository: repository, sharing: sharing)
        await model.refresh()

        #expect(model.role == .employee)
        #expect(sharing.participantRequests == 0)
    }

    @Test func onlyOwnersGetAShareItem() async {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.member(Sample.business), employees: [])
        let model = AppModel(repository: repository, sharing: FakeSharing())
        await model.refresh()
        #expect(model.shareItem() == nil)
    }

    @Test func overlappingRefreshesRunOneAtATimeAndCoalesce() async {
        let repository = FakeBusinessRepository()
        await repository.setMembership(.owner(Sample.business), employees: [Sample.owner])
        let sharing = GatedSharing(participants: [ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee")])
        let model = AppModel(repository: repository, sharing: sharing)

        let first = Task { await model.refresh() }
        while await sharing.waitingCount == 0 { await Task.yield() }
        let second = Task { await model.refresh() }
        let third = Task { await model.refresh() }
        for _ in 0..<20 { await Task.yield() }

        await sharing.open()
        await first.value
        await second.value
        await third.value

        #expect(await sharing.maxInFlight == 1)
        #expect(await sharing.participantRequests == 2)
        #expect(await repository.added.map(\.participantRecordName) == ["_a"])
        #expect(model.employees.map(\.displayName) == ["Owner", "Jordan Lee"])
    }

    @Test func joiningWaitsForTheSharedBusinessToSync() async {
        let repository = FakeBusinessRepository()
        let model = AppModel(repository: repository, sharing: FakeSharing())

        await model.acceptInvitation {}
        #expect(model.loadState == .joining)

        await repository.setMembership(.member(Sample.business), employees: [Sample.owner])
        await model.refresh()
        #expect(model.loadState == .loaded)
        #expect(model.role == .employee)

        await repository.setMembership(.none, employees: [])
        await model.refresh()
        #expect(model.loadState == .loaded)
        #expect(model.role == .needsSetup)
    }

    @Test func aFailedInviteShowsTheErrorAndStopsJoining() async {
        let model = AppModel(repository: FakeBusinessRepository(), sharing: FakeSharing())

        await model.acceptInvitation { throw FakeError() }
        #expect(model.loadState == .failed("The invite couldn't be accepted: The network went away."))

        await model.refresh()
        #expect(model.loadState == .loaded)
        #expect(model.role == .needsSetup)
    }

    @Test func showErrorSetsFailedState() {
        let model = AppModel(repository: FakeBusinessRepository(), sharing: FakeSharing())
        model.showError("Invite could not be accepted.")
        #expect(model.loadState == .failed("Invite could not be accepted."))
    }
}
