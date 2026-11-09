import Domain
import Foundation
import Persistence

actor FakeBusinessRepository: BusinessRepository {
    private(set) var membershipValue: Membership = .none
    private(set) var employeeList: [Employee] = []
    private(set) var added: [NewEmployee] = []

    func setMembership(_ membership: Membership, employees: [Employee]) {
        membershipValue = membership
        employeeList = employees
    }

    func membership() async throws -> Membership { membershipValue }

    func createBusiness(from draft: BusinessDraft) async throws -> Business {
        let business = Business(
            id: UUID(), name: draft.name, timeZoneIdentifier: draft.timeZoneIdentifier,
            payPeriodRule: draft.payPeriodRule, payPeriodAnchor: draft.payPeriodAnchor,
            missingClockOutHours: draft.missingClockOutHours,
            kioskAutoReturnSeconds: draft.kioskAutoReturnSeconds
        )
        membershipValue = .owner(business)
        employeeList = [Employee(
            id: UUID(), displayName: draft.ownerName, role: .manager,
            colorIndex: 0, isActive: true, participantRecordName: nil
        )]
        return business
    }

    func employees() async throws -> [Employee] { employeeList }

    func addEmployees(_ newEmployees: [NewEmployee]) async throws {
        guard case .owner = membershipValue else { throw BusinessRepositoryError.notOwner }
        added += newEmployees
        employeeList += newEmployees.map {
            Employee(
                id: UUID(), displayName: $0.displayName, role: .employee,
                colorIndex: $0.colorIndex, isActive: true, participantRecordName: nil
            )
        }
    }
}

struct FakeAccountStatus: CloudAccountStatus {
    var available = true

    func isAvailable() async -> Bool { available }
}

enum Sample {
    static let business = Business(
        id: UUID(), name: "Alabaster Nutrition", timeZoneIdentifier: "America/New_York",
        payPeriodRule: .weekly, payPeriodAnchor: Date(timeIntervalSince1970: 0),
        missingClockOutHours: 12, kioskAutoReturnSeconds: 10
    )

    static let owner = Employee(
        id: UUID(), displayName: "Owner", role: .manager,
        colorIndex: 0, isActive: true, participantRecordName: nil
    )
}
