import Foundation

public enum BusinessDraftError: Error, Hashable, Sendable, CaseIterable {
    case emptyName
    case emptyOwnerName
    case unknownTimeZone
    case invalidWorkplace
    case radiusOutOfRange
    case missingClockOutOutOfRange

    public var message: String {
        switch self {
        case .emptyName: "Enter the business name."
        case .emptyOwnerName: "Enter your name."
        case .unknownTimeZone: "Choose a valid time zone."
        case .invalidWorkplace: "The workplace location is invalid."
        case .radiusOutOfRange: "Clock-in distance must be between 50 and 1,000 meters."
        case .missingClockOutOutOfRange: "The missing clock-out reminder must be between 4 and 24 hours."
        }
    }
}

public struct BusinessDraft: Equatable, Sendable {
    public static let allowedRadiusRange: ClosedRange<Double> = 50...1_000
    public static let missingClockOutRange: ClosedRange<Double> = 4...24

    public var name: String
    public var ownerName: String
    public var timeZoneIdentifier: String
    public var payPeriodRule: PayPeriodRule
    public var payPeriodAnchor: Date
    public var workplace: Coordinate
    public var allowedRadiusMeters: Double
    public var missingClockOutHours: Double

    public init(
        name: String,
        ownerName: String,
        timeZoneIdentifier: String,
        payPeriodRule: PayPeriodRule,
        payPeriodAnchor: Date,
        workplace: Coordinate,
        allowedRadiusMeters: Double,
        missingClockOutHours: Double
    ) {
        self.name = name
        self.ownerName = ownerName
        self.timeZoneIdentifier = timeZoneIdentifier
        self.payPeriodRule = payPeriodRule
        self.payPeriodAnchor = payPeriodAnchor
        self.workplace = workplace
        self.allowedRadiusMeters = allowedRadiusMeters
        self.missingClockOutHours = missingClockOutHours
    }

    /// 101 E Front St, Sylvester, GA. The coordinate is approximate; the map picker in Milestone 3 refines it.
    public static func alabasterDefaults(ownerName: String, payPeriodAnchor: Date) -> BusinessDraft {
        BusinessDraft(
            name: "Alabaster Nutrition",
            ownerName: ownerName,
            timeZoneIdentifier: "America/New_York",
            payPeriodRule: .weekly,
            payPeriodAnchor: payPeriodAnchor,
            workplace: Coordinate(latitude: 31.5296, longitude: -83.8354),
            allowedRadiusMeters: 150,
            missingClockOutHours: 12
        )
    }

    public func validationErrors() -> [BusinessDraftError] {
        var errors: [BusinessDraftError] = []
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { errors.append(.emptyName) }
        if ownerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { errors.append(.emptyOwnerName) }
        if TimeZone(identifier: timeZoneIdentifier) == nil { errors.append(.unknownTimeZone) }
        if !workplace.isValid { errors.append(.invalidWorkplace) }
        if !Self.allowedRadiusRange.contains(allowedRadiusMeters) { errors.append(.radiusOutOfRange) }
        if !Self.missingClockOutRange.contains(missingClockOutHours) { errors.append(.missingClockOutOutOfRange) }
        return errors
    }
}
