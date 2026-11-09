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

        // Notches stay centred on the original corners so inset outlines are concentric with the fill.
        let r = n + insetAmount
        var notches = Path()
        for c in [CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY),
                  CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY)] {
            notches.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
        }
        return Path(inner).subtracting(notches)
    }

    public func inset(by amount: CGFloat) -> NotchedRectangle {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}
