import Foundation

public struct Business: Equatable, Sendable, Identifiable {
    public let id: UUID
    public var name: String
    public var timeZoneIdentifier: String
    public var payPeriodRule: PayPeriodRule
    public var payPeriodAnchor: Date
    public var missingClockOutHours: Double
    public var kioskAutoReturnSeconds: Double

    public init(
        id: UUID,
        name: String,
        timeZoneIdentifier: String,
        payPeriodRule: PayPeriodRule,
        payPeriodAnchor: Date,
        missingClockOutHours: Double,
        kioskAutoReturnSeconds: Double
    ) {
        self.id = id
        self.name = name
        self.timeZoneIdentifier = timeZoneIdentifier
        self.payPeriodRule = payPeriodRule
        self.payPeriodAnchor = payPeriodAnchor
        self.missingClockOutHours = missingClockOutHours
        self.kioskAutoReturnSeconds = kioskAutoReturnSeconds
    }
}
