import Foundation
import Testing
@testable import Domain

struct ParticipantReconcilerTests {
    let owner = Employee(
        id: UUID(), displayName: "Owner", role: .manager,
        colorIndex: 0, isActive: true, participantRecordName: nil
    )

    @Test func newParticipantsBecomeEmployees() {
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee")],
            existing: [owner]
        )
        #expect(result == [NewEmployee(displayName: "Jordan Lee", participantRecordName: "_a", colorIndex: 1)])
    }

    @Test func knownParticipantsAreSkipped() {
        let jordan = Employee(
            id: UUID(), displayName: "Jordan Lee", role: .employee,
            colorIndex: 1, isActive: true, participantRecordName: "_a"
        )
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee")],
            existing: [owner, jordan]
        )
        #expect(result.isEmpty)
    }

    @Test func duplicateParticipantsAreAddedOnce() {
        let participant = ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee")
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [participant, participant],
            existing: [owner]
        )
        #expect(result.count == 1)
    }

    @Test func blankNamesGetAPlaceholder() {
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [ShareParticipantInfo(recordName: "_a", displayName: "  ")],
            existing: [owner]
        )
        #expect(result.first?.displayName == "New team member")
    }

    @Test func colorsWrapAroundThePalette() {
        let existing = (0..<8).map { index in
            Employee(
                id: UUID(), displayName: "E\(index)", role: .employee,
                colorIndex: index, isActive: true, participantRecordName: "_\(index)"
            )
        }
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [ShareParticipantInfo(recordName: "_new", displayName: "New")],
            existing: existing
        )
        #expect(result.first?.colorIndex == 0)
    }

    @Test func severalNewParticipantsGetConsecutiveColors() {
        let result = ParticipantReconciler.newEmployees(
            acceptedParticipants: [
                ShareParticipantInfo(recordName: "_a", displayName: "Jordan Lee"),
                ShareParticipantInfo(recordName: "_b", displayName: "Sam Rivera"),
            ],
            existing: [owner]
        )
        #expect(result.map(\.colorIndex) == [1, 2])
    }
}
