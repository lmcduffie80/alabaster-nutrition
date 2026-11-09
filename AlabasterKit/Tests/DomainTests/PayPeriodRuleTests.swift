import Testing
@testable import Domain

struct PayPeriodRuleTests {
    @Test func weeklyIsSevenDays() {
        #expect(PayPeriodRule.weekly.lengthInDays == 7)
    }

    @Test func biweeklyIsFourteenDays() {
        #expect(PayPeriodRule.biweekly.lengthInDays == 14)
    }

    @Test func rawValuesAreStableForStorage() {
        #expect(PayPeriodRule.allCases.map(\.rawValue) == ["weekly", "biweekly"])
    }
}
