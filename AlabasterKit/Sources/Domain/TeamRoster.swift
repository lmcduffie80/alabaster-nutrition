import Foundation

public enum EmployeeNameError: Error, Hashable, Sendable {
    case empty
    case duplicate

    public var message: String {
        switch self {
        case .empty: "Enter the employee's name."
        case .duplicate: "Someone on the team already has that name. Add a last initial to tell them apart."
        }
    }
}

public struct NewEmployee: Equatable, Sendable {
    public var displayName: String
    public var colorIndex: Int

    public init(displayName: String, colorIndex: Int) {
        self.displayName = displayName
        self.colorIndex = colorIndex
    }
}

public enum TeamRoster {
    /// Must match `BrandPalette.employeeColors.count`.
    public static let paletteSize = 8

    public static func newEmployee(named name: String, existing: [Employee]) throws -> NewEmployee {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw EmployeeNameError.empty }
        let taken = existing.contains { $0.isActive && $0.displayName.caseInsensitiveCompare(trimmed) == .orderedSame }
        guard !taken else { throw EmployeeNameError.duplicate }
        return NewEmployee(displayName: trimmed, colorIndex: existing.count % paletteSize)
    }
}
