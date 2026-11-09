// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AlabasterKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "AlabasterKit", targets: ["Domain", "Brand"]),
    ],
    targets: [
        .target(name: "Domain"),
        .testTarget(name: "DomainTests", dependencies: ["Domain"]),
        .target(name: "Brand", resources: [.copy("Resources/Fonts")]),
        .testTarget(name: "BrandTests", dependencies: ["Brand", "Domain"]),
    ]
)
