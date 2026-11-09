public enum PayPeriodRule: String, CaseIterable, Hashable, Sendable, Codable {
    case weekly
    case biweekly

    public var lengthInDays: Int {
        switch self {
        case .weekly: 7
        case .biweekly: 14
        }
    }
}
