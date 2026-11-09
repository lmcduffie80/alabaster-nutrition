import SwiftUI

public struct AlabasterWordmark: View {
    public init() {}

    public var body: some View {
        VStack(spacing: -8) {
            Text("Alabaster")
                .font(BrandFonts.wordmark(size: 64))
            Text("Nutrition")
                .font(BrandFonts.heading(size: 28))
        }
        .foregroundStyle(BrandPalette.porcelain.color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Alabaster Nutrition")
    }
}
