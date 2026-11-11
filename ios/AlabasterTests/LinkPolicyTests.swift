import Foundation
import Testing
@testable import Alabaster

struct LinkPolicyTests {
    @Test(arguments: [
        "https://app.alabasternutrition.com/manage",
        "https://clerk.alabasternutrition.com/v1/client",
        "https://accounts.alabasternutrition.com/sign-in",
        "https://alabasternutrition.com",
        "https://fine-cat-12.clerk.accounts.dev/sign-in",
        "about:blank",
    ])
    func staysInApp(_ link: String) {
        #expect(LinkPolicy.staysInApp(URL(string: link)!))
    }

    @Test(arguments: [
        "https://maps.apple.com/?q=Sylvester",
        "https://alabasternutrition.com.evil.example",
        "http://app.alabasternutrition.com",
        "mailto:lee@example.com",
        "tel:2295550100",
    ])
    func opensElsewhere(_ link: String) {
        #expect(!LinkPolicy.staysInApp(URL(string: link)!))
    }
}
