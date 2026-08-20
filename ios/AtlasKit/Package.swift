// swift-tools-version: 6.2
import PackageDescription

// One target on purpose: models, API client and views ship together so a screen
// and the state it reads can't drift into separate release trains.
//
// iOS only, and iOS 26 only: both packages below declare `.iOS(.v26)` and
// nothing else, so the host-macOS build `swift test` used to run is gone —
// `make test` drives an iOS simulator through xcodebuild instead.
let package = Package(
    name: "AtlasKit",
    platforms: [.iOS(.v26)],
    products: [.library(name: "AtlasKit", targets: ["AtlasKit"])],
    dependencies: [
        .package(url: "https://github.com/joaoigorandrade/NavigationPackage", branch: "main"),
        .package(url: "https://github.com/joaoigorandrade/NetworkingPackage", branch: "main"),
    ],
    targets: [
        .target(
            name: "AtlasKit",
            dependencies: [
                .product(name: "Navigation", package: "NavigationPackage"),
                .product(name: "Networking", package: "NetworkingPackage"),
            ]
        ),
        .testTarget(name: "AtlasKitTests", dependencies: ["AtlasKit"]),
    ]
)
