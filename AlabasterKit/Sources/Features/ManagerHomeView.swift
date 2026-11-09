import Brand
import Domain
import SwiftUI

struct ManagerHomeView: View {
    let model: AppModel
    @State private var isAddingEmployee = false
    @State private var newName = ""
    @State private var addError: String?

    private var businessName: String { model.membership.business?.name ?? "" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    FramedPanel {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(businessName)
                                .font(BrandFonts.heading(size: 28))
                                .foregroundStyle(BrandPalette.porcelain.color)
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
                            Text(employee.displayName)
                            Spacer()
                            if employee.role == .manager {
                                Text("Manager").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button {
                        newName = ""
                        isAddingEmployee = true
                    } label: {
                        Label("Add Employee", systemImage: "person.badge.plus")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(BrandPalette.alabaster.color)
            .navigationTitle("Team")
            .alert("Add Employee", isPresented: $isAddingEmployee) {
                TextField("Name", text: $newName)
                Button("Add") { Task { await add() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("They'll get a PIN for the store iPad once the time clock is added.")
            }
            .alert("Couldn't Add Employee", isPresented: Binding(
                get: { addError != nil },
                set: { if !$0 { addError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(addError ?? "")
            }
        }
    }

    private func add() async {
        do {
            try await model.addEmployee(named: newName)
        } catch let error as EmployeeNameError {
            addError = error.message
        } catch {
            addError = error.localizedDescription
        }
    }
}
