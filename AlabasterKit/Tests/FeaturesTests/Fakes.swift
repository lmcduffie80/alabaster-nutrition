import CloudKit
import Domain
import Foundation
import Persistence
import Sharing

actor FakeBusinessRepository: BusinessRepository {
    private(set) var membershipValue: Membership = .none
    private(set) var employeeList: [Employee] = []
    private(set) var added: [NewEmployee] = []
    private var membershipError: (any Error)?
    private var createError: (any Error)?

    func setMembership(_ membership: Membership, employees: [Employee]) {
        membershipValue = membership
        employeeList = employees
    }

    func failMembership(with error: (any Error)?) { membershipError = error }
    func failCreate(with error: (any Error)?) { createError = error }

    func membership() async throws -> Membership {
        if let membershipError { throw membershipError }
        return membershipValue
    }

    func createBusiness(from draft: BusinessDraft) async throws -> Business {
        if let createError { throw createError }
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
        added += newEmployees
        employeeList += newEmployees.map {
            Employee(
                id: UUID(), displayName: $0.displayName, role: .employee,
                colorIndex: $0.colorIndex, isActive: true, participantRecordName: $0.participantRecordName
            )
        }
    }
}

final class FakeSharing: BusinessSharing, @unchecked Sendable {
    var iCloudAvailable = true
    var participants: [ShareParticipantInfo] = []
    var participantsError: (any Error)?
    private(set) var participantRequests = 0

    func isICloudAvailable() async -> Bool { iCloudAvailable }

    func acceptedParticipants() async throws -> [ShareParticipantInfo] {
        participantRequests += 1
        if let participantsError { throw participantsError }
        return participants
    }

    func shareItem() -> BusinessShareItem {
        BusinessShareItem(containerIdentifier: "iCloud.test") { throw CKError(.notAuthenticated) }
    }
}

/// Holds every `acceptedParticipants()` call until `open()`, and records how many ran at once.
actor GatedSharing: BusinessSharing {
    private let participants: [ShareParticipantInfo]
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var inFlight = 0
    private(set) var maxInFlight = 0
    private(set) var participantRequests = 0

    init(participants: [ShareParticipantInfo]) {
        self.participants = participants
    }

    var waitingCount: Int { waiters.count }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }

    func isICloudAvailable() async -> Bool { true }

    func acceptedParticipants() async throws -> [ShareParticipantInfo] {
        participantRequests += 1
        inFlight += 1
        maxInFlight = max(maxInFlight, inFlight)
        defer { inFlight -= 1 }
        if !isOpen {
            await withCheckedContinuation { waiters.append($0) }
        }
        return participants
    }

    nonisolated func shareItem() -> BusinessShareItem {
        BusinessShareItem(containerIdentifier: "iCloud.test") { throw CKError(.notAuthenticated) }
    }
}

struct FakeError: LocalizedError {
    var errorDescription: String? { "The network went away." }
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
