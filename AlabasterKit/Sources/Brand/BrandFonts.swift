import CoreText
import Foundation
import SwiftUI

public enum BrandFonts {
    static let scriptFile = "GreatVibes-Regular"
    static let serifFile = "CormorantGaramond-Variable"

    /// File name → PostScript name, read from the font files so names never need to be guessed.
    public static let registeredPostScriptNames: [String: String] = {
        var names: [String: String] = [:]
        for file in [scriptFile, serifFile] {
            guard let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
                  let first = descriptors.first,
                  let name = CTFontDescriptorCopyAttribute(first, kCTFontNameAttribute) as? String else { continue }
            names[file] = name
        }
        return names
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
