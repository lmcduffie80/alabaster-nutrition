import Brand
import SwiftUI

struct WelcomeView: View {
    let model: AppModel
    @State private var isCreatingBusiness = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            AlabasterWordmark()
            Text("Scheduling & Time Clock")
                .font(.headline)
                .foregroundStyle(BrandPalette.ink.color)
            FramedPanel {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Working at the shop?")
                        .font(BrandFonts.heading(size: 22))
                    Text("You don't need to set anything up. Clock in on the store iPad with the PIN your manager gives you.")
                }
                .foregroundStyle(BrandPalette.ink.color)
            }
            Button("Set Up a New Business") { isCreatingBusiness = true }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BrandPalette.alabaster.color)
        .sheet(isPresented: $isCreatingBusiness) {
            CreateBusinessView(model: model)
        }
    }
}
