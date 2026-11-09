import Testing
@testable import Domain

struct CoordinateTests {
    @Test func acceptsTheShopLocation() {
        #expect(Coordinate(latitude: 31.5296, longitude: -83.8354).isValid)
    }

    @Test func rejectsLatitudeOutOfRange() {
        #expect(!Coordinate(latitude: 90.5, longitude: 0).isValid)
    }

    @Test func rejectsLongitudeOutOfRange() {
        #expect(!Coordinate(latitude: 0, longitude: -180.5).isValid)
    }
}
