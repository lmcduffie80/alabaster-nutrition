import SwiftUI

/// Porcelain capsule with alabaster text, which meets 4.5:1 in both appearances.
/// The system prominent style puts white text on the tint, which drops below 3:1 on dark-mode porcelain.
public struct BrandProminentButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        StyledLabel(configuration: configuration)
    }

    private struct StyledLabel: View {
        let configuration: Configuration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.headline)
                .foregroundStyle(BrandPalette.alabaster.color)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Capsule().fill(BrandPalette.porcelain.color))
                .contentShape(Capsule())
                .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.45)
        }
    }
}

extension ButtonStyle where Self == BrandProminentButtonStyle {
    public static var brandProminent: BrandProminentButtonStyle { BrandProminentButtonStyle() }
}
