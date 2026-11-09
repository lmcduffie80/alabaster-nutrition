import Foundation
import Testing
@testable import Domain

struct MembershipTests {
    let business = Business(
        id: UUID(),
        name: "Alabaster Nutrition",
        timeZoneIdentifier: "America/New_York",
        payPeriodRule: .weekly,
        payPeriodAnchor: Date(timeIntervalSince1970: 0),
        workplace: Coordinate(latitude: 31.5296, longitude: -83.8354),
        allowedRadiusMeters: 150,
        missingClockOutHours: 12
    )

    @Test func noMembershipNeedsSetup() {
        #expect(Membership.none.role == .needsSetup)
        #expect(Membership.none.business == nil)
    }

    @Test func ownerIsManager() {
        #expect(Membership.owner(business).role == .manager)
        #expect(Membership.owner(business).business == business)
    }

    @Test func memberIsEmployee() {
        #expect(Membership.member(business).role == .employee)
        #expect(Membership.member(business).business == business)
    }
}
