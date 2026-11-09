import SwiftUI

/// Rectangle with concave quarter-circle corners, matching the framed panel on the shop's sign.
public struct NotchedRectangle: InsettableShape {
    public var notch: CGFloat
    private var insetAmount: CGFloat = 0

    public init(notch: CGFloat = 14) {
        self.notch = notch
    }

    public func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let n = min(notch, r.width / 2, r.height / 2)
        var path = Path()
        path.move(to: CGPoint(x: r.minX + n, y: r.minY))
        path.addLine(to: CGPoint(x: r.maxX - n, y: r.minY))
        path.addArc(center: CGPoint(x: r.maxX, y: r.minY), radius: n,
                    startAngle: .degrees(180), endAngle: .degrees(90), clockwise: true)
        path.addLine(to: CGPoint(x: r.maxX, y: r.maxY - n))
        path.addArc(center: CGPoint(x: r.maxX, y: r.maxY), radius: n,
                    startAngle: .degrees(270), endAngle: .degrees(180), clockwise: true)
        path.addLine(to: CGPoint(x: r.minX + n, y: r.maxY))
        path.addArc(center: CGPoint(x: r.minX, y: r.maxY), radius: n,
                    startAngle: .degrees(360), endAngle: .degrees(270), clockwise: true)
        path.addLine(to: CGPoint(x: r.minX, y: r.minY + n))
        path.addArc(center: CGPoint(x: r.minX, y: r.minY), radius: n,
                    startAngle: .degrees(90), endAngle: .degrees(0), clockwise: true)
        path.closeSubpath()
        return path
    }

    public func inset(by amount: CGFloat) -> NotchedRectangle {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}
