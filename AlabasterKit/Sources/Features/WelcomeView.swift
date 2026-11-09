import Brand
import SwiftUI

struct WelcomeView: View {
    let onSetUpBusiness: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 32) {
                    AlabasterWordmark()
                    Text("Scheduling & Time Clock")
                        .font(.headline)
                        .foregroundStyle(BrandPalette.ink.color)
                    FramedPanel {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Joining as staff?")
                                .font(BrandFonts.heading(size: 22, relativeTo: .title2))
                                .accessibilityAddTraits(.isHeader)
                            Text("Open the invite link your manager sent you. This screen updates once you've joined.")
                        }
                        .foregroundStyle(BrandPalette.ink.color)
                    }
                    Button("Set Up a New Business", action: onSetUpBusiness)
                        .buttonStyle(.brandProminent)
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity, minHeight: proxy.size.height)
            }
        }
        .background(BrandPalette.alabaster.color)
    }
}
