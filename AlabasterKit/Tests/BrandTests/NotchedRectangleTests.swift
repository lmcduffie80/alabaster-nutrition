import SwiftUI
import Testing
@testable import Brand

struct NotchedRectangleTests {
    let rect = CGRect(x: 0, y: 0, width: 200, height: 100)

    @Test func containsTheCenter() {
        let path = NotchedRectangle(notch: 14).path(in: rect)
        #expect(path.contains(CGPoint(x: 100, y: 50)))
    }

    @Test(arguments: [
        CGPoint(x: 2, y: 2), CGPoint(x: 198, y: 2),
        CGPoint(x: 2, y: 98), CGPoint(x: 198, y: 98),
    ])
    func cornersAreNotchedOut(point: CGPoint) {
        let path = NotchedRectangle(notch: 14).path(in: rect)
        #expect(!path.contains(point))
    }

    @Test func edgesBetweenNotchesAreFilled() {
        let path = NotchedRectangle(notch: 14).path(in: rect)
        #expect(path.contains(CGPoint(x: 100, y: 1)))
        #expect(path.contains(CGPoint(x: 1, y: 50)))
    }

    @Test func insetShrinksTheShape() {
        let path = NotchedRectangle(notch: 14).inset(by: 10).path(in: rect)
        #expect(!path.contains(CGPoint(x: 100, y: 5)))
        #expect(path.contains(CGPoint(x: 100, y: 15)))
    }
}
