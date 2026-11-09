import CoreText
import Foundation
import SwiftUI

public enum BrandFonts {
    static let scriptFile = "Allura-Regular"
    static let serifFile = "CormorantGaramond-Variable"

    /// File name → PostScript name, read from the font files so names never need to be guessed.
    /// Variable fonts expose one name per named instance; the `-Regular` instance is preferred.
    public static let registeredPostScriptNames: [String: String] = {
        var result: [String: String] = [:]
        for file in [scriptFile, serifFile] {
            guard let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] else { continue }
            let names = descriptors.compactMap { CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String }
            guard let name = names.first(where: { $0.hasSuffix("-Regular") }) ?? names.first else { continue }
            result[file] = name
        }
        return result
    }()

    /// Call once at app launch.
    public static func registerAll() {
        _ = registeredPostScriptNames
    }

    public static func wordmark(size: CGFloat) -> Font {
        .custom(registeredPostScriptNames[scriptFile] ?? "Snell Roundhand", size: size)
    }

    public static func heading(size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(registeredPostScriptNames[serifFile] ?? "Georgia", size: size, relativeTo: style)
    }
}
