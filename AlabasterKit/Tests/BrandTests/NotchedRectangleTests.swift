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

    @Test func zeroRectGivesAnEmptyPath() {
        #expect(NotchedRectangle().path(in: .zero).isEmpty)
    }

    @Test func overInsetGivesAnEmptyPath() {
        #expect(NotchedRectangle().inset(by: 60).path(in: rect).isEmpty)
    }

    @Test func zeroNotchIsAPlainRectangle() {
        let path = NotchedRectangle(notch: 0).path(in: rect)
        #expect(path.contains(CGPoint(x: 1, y: 1)))
        #expect(path.boundingRect == rect)
    }

    @Test(arguments: [CGPoint(x: 1, y: 13), CGPoint(x: 13, y: 1)])
    func cornersCurveInwardNotOutward(point: CGPoint) {
        // Inside a rounded corner of radius 14, but outside a concave notch.
        #expect(!NotchedRectangle(notch: 14).path(in: rect).contains(point))
    }

    @Test func insetCornersAreConcentric() {
        let path = NotchedRectangle(notch: 14).inset(by: 5).path(in: rect)
        let diagonal = 1 / 2.0.squareRoot()
        // Arc of radius 19 centred on the original corner (0, 0).
        #expect(!path.contains(CGPoint(x: 18 * diagonal, y: 18 * diagonal)))
        #expect(path.contains(CGPoint(x: 20 * diagonal, y: 20 * diagonal)))
    }

    @Test func largeInsetStaysInsideTheInsetRect() {
        let path = NotchedRectangle(notch: 14).inset(by: 45).path(in: rect)
        #expect(rect.insetBy(dx: 45, dy: 45).contains(path.boundingRect))
        #expect(path.contains(CGPoint(x: 100, y: 50)))
    }

    @Test func overlappingNotchesRemoveTheShortEdge() {
        let short = CGRect(x: 0, y: 0, width: 200, height: 40)
        #expect(!NotchedRectangle(notch: 14).inset(by: 15).path(in: short).contains(CGPoint(x: 184, y: 20)))
    }
}
