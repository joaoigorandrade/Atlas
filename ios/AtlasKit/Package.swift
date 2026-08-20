// swift-tools-version: 6.0
import PackageDescription

// One target on purpose: models, API client and views ship together so a screen
// and the state it reads can't drift into separate release trains.
// macOS is listed only so `swift test` runs on the host without a simulator.
let package = Package(
    name: "AtlasKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "AtlasKit", targets: ["AtlasKit"])],
    targets: [
        .target(name: "AtlasKit"),
        .testTarget(name: "AtlasKitTests", dependencies: ["AtlasKit"]),
    ]
)
