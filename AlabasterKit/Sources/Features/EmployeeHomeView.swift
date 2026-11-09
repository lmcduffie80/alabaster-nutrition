import Brand
import SwiftUI

struct EmployeeHomeView: View {
    let model: AppModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                FramedPanel {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("You're on the team")
                            .font(BrandFonts.heading(size: 26))
                            .foregroundStyle(BrandPalette.porcelain.color)
                        Text(model.membership.business?.name ?? "")
                            .font(.headline)
                        Text("Your shifts will show up here once your manager publishes a schedule.")
                    }
                    .foregroundStyle(BrandPalette.ink.color)
                }
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BrandPalette.alabaster.color)
            .navigationTitle("Today")
        }
    }
}
