import SwiftUI

/// Rectangle with concave quarter-circle corners, matching the framed panel on the shop's sign.
public struct NotchedRectangle: InsettableShape {
    public var notch: CGFloat
    private var insetAmount: CGFloat = 0

    public init(notch: CGFloat = 14) {
        self.notch = notch
    }

    public var animatableData: CGFloat {
        get { notch }
        set { notch = newValue }
    }

    public func path(in rect: CGRect) -> Path {
        let inner = rect.insetBy(dx: insetAmount, dy: insetAmount)
        guard !inner.isNull, inner.width > 0, inner.height > 0 else { return Path() }
        let n = max(0, min(notch, rect.width / 2, rect.height / 2))
        guard n > 0 else { return Path(inner) }

        // Arcs stay centred on the original corners so inset outlines are concentric with the fill.
        let radius = n + insetAmount
        let offset = Angle.radians(asin(insetAmount / radius))
        let corners: [(center: CGPoint, start: Double)] = [
            (CGPoint(x: rect.maxX, y: rect.minY), 180),
            (CGPoint(x: rect.maxX, y: rect.maxY), 270),
            (CGPoint(x: rect.minX, y: rect.maxY), 360),
            (CGPoint(x: rect.minX, y: rect.minY), 90),
        ]
        var path = Path()
        for corner in corners {
            path.addArc(
                center: corner.center,
                radius: radius,
                startAngle: .degrees(corner.start) - offset,
                endAngle: .degrees(corner.start - 90) + offset,
                clockwise: true
            )
        }
        path.closeSubpath()
        return path
    }

    public func inset(by amount: CGFloat) -> NotchedRectangle {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}
