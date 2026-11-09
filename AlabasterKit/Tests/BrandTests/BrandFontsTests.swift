import CoreText
import Testing
@testable import Brand

struct BrandFontsTests {
    @Test func bothBundledFontsRegister() {
        BrandFonts.registerAll()
        #expect(BrandFonts.registeredPostScriptNames.count == 2)
    }

    @Test func registeredNamesResolveToRealFonts() throws {
        BrandFonts.registerAll()
        for name in BrandFonts.registeredPostScriptNames.values {
            let font = CTFontCreateWithName(name as CFString, 12, nil)
            #expect(CTFontCopyPostScriptName(font) as String == name)
        }
    }
}
