import Foundation

public enum EmployeeRole: String, Hashable, Sendable, Codable {
    case manager
    case employee
}

public struct Employee: Equatable, Sendable, Identifiable {
    public let id: UUID
    public var displayName: String
    public var role: EmployeeRole
    public var colorIndex: Int
    public var isActive: Bool
    /// CloudKit user record name once this person links the phone app (Milestone 5).
    /// `nil` for the owner and for employees who only clock in at the store iPad.
    public var participantRecordName: String?

    public init(
        id: UUID,
        displayName: String,
        role: EmployeeRole,
        colorIndex: Int,
        isActive: Bool,
        participantRecordName: String?
    ) {
        self.id = id
        self.displayName = displayName
        self.role = role
        self.colorIndex = colorIndex
        self.isActive = isActive
        self.participantRecordName = participantRecordName
    }
}
