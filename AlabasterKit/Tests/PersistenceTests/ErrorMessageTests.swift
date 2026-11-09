import Domain
import Foundation
import Testing
@testable import Persistence

struct ErrorMessageTests {
    @Test func aSecondBusinessExplainsTheLimit() {
        let error: any Error = BusinessRepositoryError.businessAlreadyExists
        #expect(error.localizedDescription == "This Apple Account already has a business.")
    }

    @Test func anInvalidDraftListsEveryProblem() {
        let error: any Error = BusinessRepositoryError.invalidDraft([.emptyName, .emptyOwnerName])
        #expect(error.localizedDescription == "Enter the business name. Enter your name.")
    }

    @Test func onlyTheOwnerCanChangeTheTeam() {
        let error: any Error = BusinessRepositoryError.notOwner
        #expect(error.localizedDescription == "Only the business owner can do that.")
    }

    @Test func aMissingStoreHasAPlainMessage() {
        let error: any Error = PersistenceError.storeMissing
        #expect(error.localizedDescription == "The app's data couldn't be opened. Restart the app and try again.")
    }
}
