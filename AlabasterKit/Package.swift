// swift-tools-version: 6.0
import PackageDescription

let appleGlue: [SwiftSetting] = [.swiftLanguageMode(.v5)]

let package = Package(
    name: "AlabasterKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "AlabasterKit", targets: ["Domain", "Brand", "Persistence", "Sharing", "Features"]),
    ],
    targets: [
        .target(name: "Domain"),
        .testTarget(name: "DomainTests", dependencies: ["Domain"]),
        .target(name: "Brand", resources: [.copy("Resources/Fonts")]),
        .testTarget(name: "BrandTests", dependencies: ["Brand", "Domain"]),
        .target(name: "Persistence", dependencies: ["Domain"], swiftSettings: appleGlue),
        .testTarget(name: "PersistenceTests", dependencies: ["Persistence", "Domain"], swiftSettings: appleGlue),
        .target(name: "Sharing", dependencies: ["Domain", "Persistence"], swiftSettings: appleGlue),
        .target(name: "Features", dependencies: ["Domain", "Brand", "Persistence", "Sharing"]),
        .testTarget(name: "FeaturesTests", dependencies: ["Features", "Domain", "Persistence", "Sharing"]),
    ]
)
