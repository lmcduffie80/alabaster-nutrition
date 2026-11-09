import Foundation
import Testing
@testable import Domain

struct TeamRosterTests {
    let owner = Employee(
        id: UUID(), displayName: "Owner", role: .manager,
        colorIndex: 0, isActive: true, participantRecordName: nil
    )

    @Test func aNewNameBecomesAnEmployee() throws {
        let result = try TeamRoster.newEmployee(named: "  Jordan Lee ", existing: [owner])
        #expect(result == NewEmployee(displayName: "Jordan Lee", colorIndex: 1))
    }

    @Test func blankNamesAreRejected() {
        #expect(throws: EmployeeNameError.empty) {
            try TeamRoster.newEmployee(named: "   ", existing: [owner])
        }
    }

    @Test func duplicateActiveNamesAreRejectedIgnoringCase() {
        #expect(throws: EmployeeNameError.duplicate) {
            try TeamRoster.newEmployee(named: "owner", existing: [owner])
        }
    }

    @Test func inactiveNamesCanBeReused() throws {
        var former = owner
        former.isActive = false
        let result = try TeamRoster.newEmployee(named: "Owner", existing: [former])
        #expect(result.displayName == "Owner")
    }

    @Test func colorsWrapAroundThePalette() throws {
        let existing = (0..<8).map { index in
            Employee(
                id: UUID(), displayName: "E\(index)", role: .employee,
                colorIndex: index, isActive: true, participantRecordName: nil
            )
        }
        let result = try TeamRoster.newEmployee(named: "New", existing: existing)
        #expect(result.colorIndex == 0)
    }

    @Test func everyErrorHasAMessage() {
        for error in [EmployeeNameError.empty, .duplicate] {
            #expect(!error.message.isEmpty)
        }
    }
}
