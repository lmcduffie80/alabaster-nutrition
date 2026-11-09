import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

public struct BrandColor: Sendable {
    public let light: String
    public let dark: String
    public let color: Color

    public init(light: String, dark: String) {
        assert(HexColor.parse(light) != nil && HexColor.parse(dark) != nil, "Invalid brand hex: \(light) / \(dark)")
        self.light = light
        self.dark = dark
        let fallback = RGBA(red: 0, green: 0, blue: 0, alpha: 1)
        self.color = Self.makeColor(
            light: HexColor.parse(light) ?? fallback,
            dark: HexColor.parse(dark) ?? fallback
        )
    }

    private static func makeColor(light: RGBA, dark: RGBA) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
        #elseif canImport(AppKit)
        return Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let c = isDark ? dark : light
            return NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
        #endif
    }
}

/// Colors estimated from the Alabaster Nutrition Facebook page. Replace hex values when official ones arrive.
///
/// Safe for body text: `ink` on `alabaster` or `sage`, `porcelain` on `alabaster`.
/// Large text only (18pt+): `porcelain` on `sage`. Decorative only: `gilt`, `sage` as a foreground.
/// `employeeColors` are fill and indicator colors, not text colors.
public enum BrandPalette {
    public static let porcelain = BrandColor(light: "#3E5C9A", dark: "#8FA8DA")
    public static let sage = BrandColor(light: "#A9BC98", dark: "#3E4B38")
    public static let alabaster = BrandColor(light: "#FAF8F3", dark: "#141B2D")
    public static let ink = BrandColor(light: "#1F2A44", dark: "#EEF1F7")
    public static let gilt = BrandColor(light: "#9C7A3C", dark: "#C9A764")

    public static let all: [BrandColor] = [porcelain, sage, alabaster, ink, gilt]

    public static let employeeColors: [BrandColor] = [
        porcelain,
        BrandColor(light: "#6C8659", dark: "#A9BC98"),
        BrandColor(light: "#5B7FC2", dark: "#A3BCE8"),
        gilt,
        BrandColor(light: "#2E4470", dark: "#7690C8"),
        BrandColor(light: "#5F7F73", dark: "#93B5A8"),
        BrandColor(light: "#8A6F9E", dark: "#B9A2CB"),
        BrandColor(light: "#B5655A", dark: "#DB9A90"),
    ]

    public static func employeeColor(at index: Int) -> BrandColor {
        let count = employeeColors.count
        return employeeColors[((index % count) + count) % count]
    }
}
