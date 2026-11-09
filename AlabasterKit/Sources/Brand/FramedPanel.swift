import SwiftUI

public struct FramedPanel<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NotchedRectangle().fill(BrandPalette.sage.color))
            .overlay(NotchedRectangle().strokeBorder(BrandPalette.ink.color, lineWidth: 2))
            .overlay(NotchedRectangle().inset(by: 5).strokeBorder(BrandPalette.gilt.color, lineWidth: 1))
    }
}
