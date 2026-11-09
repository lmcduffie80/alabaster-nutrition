import Foundation

public struct ShareParticipantInfo: Equatable, Sendable {
    public var recordName: String
    public var displayName: String

    public init(recordName: String, displayName: String) {
        self.recordName = recordName
        self.displayName = displayName
    }
}

public struct NewEmployee: Equatable, Sendable {
    public var displayName: String
    public var participantRecordName: String
    public var colorIndex: Int

    public init(displayName: String, participantRecordName: String, colorIndex: Int) {
        self.displayName = displayName
        self.participantRecordName = participantRecordName
        self.colorIndex = colorIndex
    }
}

public enum ParticipantReconciler {
    /// Must match `BrandPalette.employeeColors.count`.
    public static let paletteSize = 8

    public static func newEmployees(
        acceptedParticipants: [ShareParticipantInfo],
        existing: [Employee]
    ) -> [NewEmployee] {
        var known = Set(existing.compactMap(\.participantRecordName))
        var nextColor = existing.count
        var result: [NewEmployee] = []
        for participant in acceptedParticipants where known.insert(participant.recordName).inserted {
            let trimmed = participant.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            result.append(NewEmployee(
                displayName: trimmed.isEmpty ? "New team member" : trimmed,
                participantRecordName: participant.recordName,
                colorIndex: nextColor % paletteSize
            ))
            nextColor += 1
        }
        return result
    }
}
