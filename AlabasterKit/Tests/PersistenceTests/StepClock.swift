import Foundation

/// Returns `start` on the first call and one second later on each call after that.
final class StepClock: @unchecked Sendable {
    private let lock = NSLock()
    private var next: Date

    init(start: Date) {
        next = start
    }

    func callAsFunction() -> Date {
        lock.lock()
        defer { lock.unlock() }
        let current = next
        next = next.addingTimeInterval(1)
        return current
    }
}
