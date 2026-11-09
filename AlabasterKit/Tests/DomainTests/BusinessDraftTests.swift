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
        #expect(draft.missingClockOutHours == 12)
        #expect(draft.kioskAutoReturnSeconds == 10)
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

    @Test(arguments: [4, 61])
    func kioskAutoReturnOutsideRangeIsRejected(seconds: Int) {
        var draft = validDraft()
        draft.kioskAutoReturnSeconds = seconds
        #expect(draft.validationErrors() == [.kioskAutoReturnOutOfRange])
    }

    @Test(arguments: [3.0, 25.0])
    func missingClockOutOutsideRangeIsRejected(hours: Double) {
        var draft = validDraft()
        draft.missingClockOutHours = hours
        #expect(draft.validationErrors() == [.missingClockOutOutOfRange])
    }

    @Test func everyErrorHasAMessage() {
        let errors: [BusinessDraftError] = [
            .emptyName, .emptyOwnerName, .unknownTimeZone,
            .missingClockOutOutOfRange, .kioskAutoReturnOutOfRange,
        ]
        for error in errors {
            #expect(!error.message.isEmpty)
        }
    }
}
