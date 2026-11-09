import Foundation
import Testing
@testable import Domain

struct BusinessDraftTests {
    let anchor = Date(timeIntervalSince1970: 1_793_000_000)

    func validDraft() -> BusinessDraft {
        .alabasterDefaults(ownerName: "Owner", payPeriodAnchor: anchor)
    }

    @Test func defaultsDescribeTheShop() {
        let draft = validDraft()
        #expect(draft.name == "Alabaster Nutrition")
        #expect(draft.timeZoneIdentifier == "America/New_York")
        #expect(draft.payPeriodRule == .weekly)
        #expect(draft.workplace == Coordinate(latitude: 31.5296, longitude: -83.8354))
        #expect(draft.allowedRadiusMeters == 150)
        #expect(draft.missingClockOutHours == 12)
    }

    @Test func defaultsAreValid() {
        #expect(validDraft().validationErrors().isEmpty)
    }

    @Test func blankNamesAreRejected() {
        var draft = validDraft()
        draft.name = "   "
        draft.ownerName = ""
        #expect(draft.validationErrors() == [.emptyName, .emptyOwnerName])
    }

    @Test func unknownTimeZoneIsRejected() {
        var draft = validDraft()
        draft.timeZoneIdentifier = "Mars/Olympus_Mons"
        #expect(draft.validationErrors() == [.unknownTimeZone])
    }

    @Test func invalidWorkplaceIsRejected() {
        var draft = validDraft()
        draft.workplace = Coordinate(latitude: 120, longitude: 0)
        #expect(draft.validationErrors() == [.invalidWorkplace])
    }

    @Test(arguments: [49.0, 1_001.0])
    func radiusOutsideRangeIsRejected(radius: Double) {
        var draft = validDraft()
        draft.allowedRadiusMeters = radius
        #expect(draft.validationErrors() == [.radiusOutOfRange])
    }

    @Test(arguments: [3.0, 25.0])
    func missingClockOutOutsideRangeIsRejected(hours: Double) {
        var draft = validDraft()
        draft.missingClockOutHours = hours
        #expect(draft.validationErrors() == [.missingClockOutOutOfRange])
    }

    @Test(arguments: [50.0, 1_000.0])
    func radiusAtRangeLimitsIsAccepted(radius: Double) {
        var draft = validDraft()
        draft.allowedRadiusMeters = radius
        #expect(draft.validationErrors().isEmpty)
    }

    @Test(arguments: [4.0, 24.0])
    func missingClockOutAtRangeLimitsIsAccepted(hours: Double) {
        var draft = validDraft()
        draft.missingClockOutHours = hours
        #expect(draft.validationErrors().isEmpty)
    }

    @Test func everyErrorHasAMessage() {
        for error in BusinessDraftError.allCases {
            #expect(!error.message.isEmpty)
        }
    }
}
