import SwiftUI

public struct AlabasterWordmark: View {
    @ScaledMetric(relativeTo: .largeTitle) private var overlap: CGFloat = -8

    public init() {}

    public var body: some View {
        VStack(spacing: overlap) {
            Text(verbatim: "Alabaster")
                .font(BrandFonts.wordmark(size: 64))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(verbatim: "Nutrition")
                .font(BrandFonts.heading(size: 28, relativeTo: .largeTitle))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .foregroundStyle(BrandPalette.porcelain.color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Alabaster Nutrition")
        .accessibilityAddTraits(.isHeader)
    }
}
