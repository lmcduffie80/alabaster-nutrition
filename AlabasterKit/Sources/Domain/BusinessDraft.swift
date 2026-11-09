import Foundation

public enum BusinessDraftError: Error, Hashable, Sendable, CaseIterable {
    case emptyName
    case emptyOwnerName
    case unknownTimeZone
    case missingClockOutOutOfRange
    case kioskAutoReturnOutOfRange

    public var message: String {
        switch self {
        case .emptyName: "Enter the business name."
        case .emptyOwnerName: "Enter your name."
        case .unknownTimeZone: "Choose a valid time zone."
        case .missingClockOutOutOfRange: "The missing clock-out reminder must be between 4 and 24 hours."
        case .kioskAutoReturnOutOfRange: "Return to keypad must be between 5 and 60 seconds."
        }
    }
}

public struct BusinessDraft: Equatable, Sendable {
    public static let missingClockOutRange: ClosedRange<Double> = 4...24
    public static let kioskAutoReturnRange: ClosedRange<Double> = 5...60
    public static let defaultMissingClockOutHours: Double = 12
    public static let defaultKioskAutoReturnSeconds: Double = 10

    public var name: String
    public var ownerName: String
    public var timeZoneIdentifier: String
    public var payPeriodRule: PayPeriodRule
    public var payPeriodAnchor: Date
    public var missingClockOutHours: Double
    public var kioskAutoReturnSeconds: Double

    public init(
        name: String,
        ownerName: String,
        timeZoneIdentifier: String,
        payPeriodRule: PayPeriodRule,
        payPeriodAnchor: Date,
        missingClockOutHours: Double,
        kioskAutoReturnSeconds: Double
    ) {
        self.name = name
        self.ownerName = ownerName
        self.timeZoneIdentifier = timeZoneIdentifier
        self.payPeriodRule = payPeriodRule
        self.payPeriodAnchor = payPeriodAnchor
        self.missingClockOutHours = missingClockOutHours
        self.kioskAutoReturnSeconds = kioskAutoReturnSeconds
    }

    public static func alabasterDefaults(ownerName: String, payPeriodAnchor: Date) -> BusinessDraft {
        BusinessDraft(
            name: "Alabaster Nutrition",
            ownerName: ownerName,
            timeZoneIdentifier: "America/New_York",
            payPeriodRule: .weekly,
            payPeriodAnchor: payPeriodAnchor,
            missingClockOutHours: defaultMissingClockOutHours,
            kioskAutoReturnSeconds: defaultKioskAutoReturnSeconds
        )
    }

    public func validationErrors() -> [BusinessDraftError] {
        var errors: [BusinessDraftError] = []
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { errors.append(.emptyName) }
        if ownerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { errors.append(.emptyOwnerName) }
        if TimeZone(identifier: timeZoneIdentifier) == nil { errors.append(.unknownTimeZone) }
        if !Self.missingClockOutRange.contains(missingClockOutHours) { errors.append(.missingClockOutOutOfRange) }
        if !Self.kioskAutoReturnRange.contains(kioskAutoReturnSeconds) { errors.append(.kioskAutoReturnOutOfRange) }
        return errors
    }
}
