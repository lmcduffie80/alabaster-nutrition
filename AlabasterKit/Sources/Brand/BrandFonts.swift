import CoreText
import Foundation
import SwiftUI

public enum BrandFonts {
    static let scriptFile = "Allura-Regular"
    static let serifFile = "CormorantGaramond-Variable"

    /// File name → PostScript name, read from the font files so names never need to be guessed.
    /// Variable fonts expose one name per named instance; the `-Regular` instance is preferred.
    /// Only names that CoreText resolves after registration are recorded.
    public static let registeredPostScriptNames: [String: String] = {
        var result: [String: String] = [:]
        for file in [scriptFile, serifFile] {
            guard let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts") else {
                assertionFailure("Missing bundled font \(file).ttf")
                continue
            }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] else { continue }
            let names = descriptors.compactMap { CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String }
            guard let name = names.first(where: { $0.hasSuffix("-Regular") }) ?? names.first else { continue }
            let font = CTFontCreateWithName(name as CFString, 12, nil)
            guard CTFontCopyPostScriptName(font) as String == name else { continue }
            result[file] = name
        }
        return result
    }()

    /// Call once at app launch.
    public static func registerAll() {
        _ = registeredPostScriptNames
    }

    /// Scales relative to `.largeTitle` so the logo stays proportionate at large accessibility sizes.
    public static func wordmark(size: CGFloat) -> Font {
        .custom(registeredPostScriptNames[scriptFile] ?? "SnellRoundhand", size: size, relativeTo: .largeTitle)
    }

    public static func heading(size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(registeredPostScriptNames[serifFile] ?? "Georgia", size: size, relativeTo: style)
    }
}
