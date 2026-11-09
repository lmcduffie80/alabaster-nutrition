// swift-tools-version: 6.0
import PackageDescription

let appleGlue: [SwiftSetting] = [.swiftLanguageMode(.v5)]

let package = Package(
    name: "AlabasterKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "AlabasterKit", targets: ["Domain", "Brand", "Persistence", "Features"]),
    ],
    targets: [
        .target(name: "Domain"),
        .testTarget(name: "DomainTests", dependencies: ["Domain"]),
        .target(name: "Brand", resources: [.copy("Resources/Fonts")]),
        .testTarget(name: "BrandTests", dependencies: ["Brand"]),
        .target(name: "Persistence", dependencies: ["Domain"], swiftSettings: appleGlue),
        .testTarget(name: "PersistenceTests", dependencies: ["Persistence", "Domain"], swiftSettings: appleGlue),
        .target(name: "Features", dependencies: ["Domain", "Brand", "Persistence"]),
        .testTarget(name: "FeaturesTests", dependencies: ["Features", "Domain", "Persistence"]),
    ]
)
