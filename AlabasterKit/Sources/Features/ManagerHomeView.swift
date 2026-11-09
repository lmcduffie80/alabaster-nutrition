import Brand
import Domain
import SwiftUI

struct ManagerHomeView: View {
    let model: AppModel

    private var businessName: String { model.membership.business?.name ?? "" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    FramedPanel {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(businessName)
                                .font(BrandFonts.heading(size: 28, relativeTo: .title))
                                .foregroundStyle(BrandPalette.porcelain.color)
                                .accessibilityAddTraits(.isHeader)
                            Text("Manager")
                                .font(.subheadline)
                                .foregroundStyle(BrandPalette.ink.color)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section("Team") {
                    ForEach(model.employees) { employee in
                        HStack(spacing: 12) {
                            Circle()
                                .fill(BrandPalette.employeeColor(at: employee.colorIndex).color)
                                .frame(width: 12, height: 12)
                                .accessibilityHidden(true)
                            Text(employee.displayName)
                            Spacer()
                            if employee.role == .manager {
                                Text("Manager").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if let item = model.shareItem() {
                        ShareLink(item: item, preview: SharePreview("Join \(businessName)")) {
                            Label("Invite Employees", systemImage: "person.badge.plus")
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(BrandPalette.alabaster.color)
            .navigationTitle("Team")
        }
    }
}
