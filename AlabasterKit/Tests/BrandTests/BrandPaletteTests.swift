import Domain
import Testing
@testable import Brand

struct HexColorTests {
    @Test func parsesSixDigitHexWithHash() throws {
        let rgba = try #require(HexColor.parse("#3E5C9A"))
        #expect(abs(rgba.red - 62.0 / 255) < 0.0001)
        #expect(abs(rgba.green - 92.0 / 255) < 0.0001)
        #expect(abs(rgba.blue - 154.0 / 255) < 0.0001)
        #expect(rgba.alpha == 1)
    }

    @Test func parsesEightDigitHexWithoutHash() throws {
        let rgba = try #require(HexColor.parse("3E5C9A80"))
        #expect(abs(rgba.alpha - 128.0 / 255) < 0.0001)
    }

    @Test(arguments: ["", "#12345", "#GGGGGG", "+12345", "#1234567"])
    func rejectsMalformedHex(input: String) {
        #expect(HexColor.parse(input) == nil)
    }
}

struct BrandPaletteTests {
    @Test func everyBrandColorParsesInBothAppearances() {
        for color in BrandPalette.all + BrandPalette.employeeColors {
            #expect(HexColor.parse(color.light) != nil, "light \(color.light)")
            #expect(HexColor.parse(color.dark) != nil, "dark \(color.dark)")
        }
    }

    @Test func paletteSizeMatchesTheReconciler() {
        #expect(BrandPalette.employeeColors.count == ParticipantReconciler.paletteSize)
    }

    @Test func employeeColorIndexWraps() {
        #expect(BrandPalette.employeeColor(at: 9).light == BrandPalette.employeeColors[1].light)
        #expect(BrandPalette.employeeColor(at: -1).light == BrandPalette.employeeColors[7].light)
    }
}
