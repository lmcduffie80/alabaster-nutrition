public enum AppRole: Equatable, Sendable {
    case needsSetup
    case manager
    case employee
}

/// The current user's relationship to the business. Ownership of the Business zone decides the role.
public enum Membership: Equatable, Sendable {
    case none
    case owner(Business)
    case member(Business)

    public var role: AppRole {
        switch self {
        case .none: .needsSetup
        case .owner: .manager
        case .member: .employee
        }
    }

    public var business: Business? {
        switch self {
        case .none: nil
        case .owner(let business), .member(let business): business
        }
    }
}
