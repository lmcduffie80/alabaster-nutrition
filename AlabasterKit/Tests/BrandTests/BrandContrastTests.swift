import Foundation
import Testing
@testable import Brand

struct BrandContrastTests {
    private func luminance(_ hex: String) throws -> Double {
        let rgba = try #require(HexColor.parse(hex))
        func linear(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(rgba.red) + 0.7152 * linear(rgba.green) + 0.0722 * linear(rgba.blue)
    }

    private func contrast(_ a: String, _ b: String) throws -> Double {
        let (la, lb) = (try luminance(a), try luminance(b))
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    @Test func prominentButtonTextMeetsAAInBothAppearances() throws {
        let text = BrandPalette.alabaster, fill = BrandPalette.porcelain
        #expect(try contrast(text.light, fill.light) >= 4.5)
        #expect(try contrast(text.dark, fill.dark) >= 4.5)
    }
}
