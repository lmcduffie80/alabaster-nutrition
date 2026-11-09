import Domain
import SwiftUI

struct CreateBusinessView: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @ViewState private var draft = BusinessDraft.alabasterDefaults(ownerName: "", payPeriodAnchor: .now)
    @ViewState private var errors: [BusinessDraftError] = []
    @ViewState private var saveError: String?
    @ViewState private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Business") {
                    TextField("Business name", text: $draft.name)
                    TextField("Your name", text: $draft.ownerName)
                }
                Section("Pay period") {
                    Picker("Frequency", selection: $draft.payPeriodRule) {
                        Text("Weekly").tag(PayPeriodRule.weekly)
                        Text("Every two weeks").tag(PayPeriodRule.biweekly)
                    }
                    DatePicker("First period starts", selection: $draft.payPeriodAnchor, displayedComponents: .date)
                }
                Section {
                    Stepper(value: $draft.allowedRadiusMeters, in: BusinessDraft.allowedRadiusRange, step: 25) {
                        LabeledContent("Clock-in distance", value: "\(Int(draft.allowedRadiusMeters)) m")
                    }
                    Stepper(value: $draft.missingClockOutHours, in: BusinessDraft.missingClockOutRange, step: 1) {
                        LabeledContent("Missing clock-out after", value: "\(Int(draft.missingClockOutHours)) h")
                    }
                } header: {
                    Text("Time clock")
                } footer: {
                    Text("Workplace: 101 E Front St, Sylvester, GA. You can fine-tune the location on a map later.")
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
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await save() } }
                        .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        errors = draft.validationErrors()
        saveError = nil
        guard errors.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await model.createBusiness(draft)
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }
}
