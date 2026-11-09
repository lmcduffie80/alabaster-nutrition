import Foundation

public struct Business: Equatable, Sendable, Identifiable {
    public let id: UUID
    public var name: String
    public var timeZoneIdentifier: String
    public var payPeriodRule: PayPeriodRule
    public var payPeriodAnchor: Date
    public var workplace: Coordinate
    public var allowedRadiusMeters: Double
    public var missingClockOutHours: Double

    public init(
        id: UUID,
        name: String,
        timeZoneIdentifier: String,
        payPeriodRule: PayPeriodRule,
        payPeriodAnchor: Date,
        workplace: Coordinate,
        allowedRadiusMeters: Double,
        missingClockOutHours: Double
    ) {
        self.id = id
        self.name = name
        self.timeZoneIdentifier = timeZoneIdentifier
        self.payPeriodRule = payPeriodRule
        self.payPeriodAnchor = payPeriodAnchor
        self.workplace = workplace
        self.allowedRadiusMeters = allowedRadiusMeters
        self.missingClockOutHours = missingClockOutHours
    }
}
