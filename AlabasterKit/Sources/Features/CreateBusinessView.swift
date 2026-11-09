import Brand
import Domain
import SwiftUI

struct CreateBusinessView: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = BusinessDraft.alabasterDefaults(ownerName: "", payPeriodAnchor: .now)
    @State private var errors: [BusinessDraftError] = []
    @State private var saveError: String?
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                #if os(macOS)
                Section {
                    Text("Set Up Your Business")
                        .font(BrandFonts.heading(size: 26, relativeTo: .title2))
                        .foregroundStyle(BrandPalette.ink.color)
                        .accessibilityAddTraits(.isHeader)
                        .listRowBackground(Color.clear)
                }
                #endif
                Section("Business") {
                    TextField("Business name", text: $draft.name)
                    TextField("Your name", text: $draft.ownerName)
                        #if os(iOS)
                        .textContentType(.name)
                        #endif
                }
                Section("Pay period") {
                    Picker("Frequency", selection: $draft.payPeriodRule) {
                        Text("Weekly").tag(PayPeriodRule.weekly)
                        Text("Every two weeks").tag(PayPeriodRule.biweekly)
                    }
                    DatePicker("First period starts", selection: $draft.payPeriodAnchor, displayedComponents: .date)
                }
                Section("Kiosk") {
                    Stepper(value: $draft.missingClockOutHours, in: BusinessDraft.missingClockOutRange, step: 1) {
                        LabeledContent("Missing clock-out after", value: "\(Int(draft.missingClockOutHours)) h")
                    }
                    Stepper(value: $draft.kioskAutoReturnSeconds, in: BusinessDraft.kioskAutoReturnRange, step: 5) {
                        LabeledContent("Return to keypad after", value: "\(Int(draft.kioskAutoReturnSeconds)) s")
                    }
                }
                if !errors.isEmpty || saveError != nil {
                    Section {
                        ForEach(errors, id: \.self) { Text($0.message) }
                        if let saveError { Text(saveError) }
                    }
                    .foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Set Up Your Business")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                            .accessibilityLabel("Creating business")
                    } else {
                        Button("Create", action: startSave)
                    }
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 480)
        #endif
    }

    /// Flips `isSaving` before any suspension point, so a second tap cannot start another save.
    private func startSave() {
        guard !isSaving else { return }
        errors = draft.validationErrors()
        saveError = nil
        guard errors.isEmpty else { return }
        isSaving = true
        Task { await save() }
    }

    private func save() async {
        defer { isSaving = false }
        do {
            try await model.createBusiness(draft)
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }
}
