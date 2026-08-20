import ProjectDescription

// The three values the app launches with are baked into Info.plist from the
// environment Tuist forwards into this manifest; `generate.sh` fills that from
// the .env.local the web app already keeps them in.
// ponytail: none of the three change per build, so a fetched remote config
// would be machinery for nothing.
let project = Project(
    name: "Atlas",
    packages: [.local(path: "AtlasKit")],
    targets: [
        .target(
            name: "Atlas",
            destinations: .iOS,
            product: .app,
            bundleId: "com.joaoigor.atlas",
            deploymentTargets: .iOS("17.0"),
            infoPlist: .extendingDefault(with: [
                "UILaunchScreen": ["UIColorName": ""],
                "CFBundleDisplayName": "Atlas",
                // Voice: without both, the mic beside every free-text answer
                // kills the app the first time it is pressed.
                "NSMicrophoneUsageDescription": "Para responder falando, em vez de digitar.",
                "NSSpeechRecognitionUsageDescription": "Para transcrever o que você fala nas respostas.",
                // The dev server is plain http on the host.
                "NSAppTransportSecurity": ["NSAllowsLocalNetworking": true],
                // Screen 4 — the confirmation link comes back into the app.
                "CFBundleURLTypes": [["CFBundleURLSchemes": ["atlas"]]],
                "ATLAS_BASE_URL": .string(Environment.atlasBaseUrl.getString(default: "http://localhost:3000")),
                "SUPABASE_URL": .string(Environment.supabaseUrl.getString(default: "")),
                "SUPABASE_PUBLISHABLE_KEY": .string(Environment.supabasePublishableKey.getString(default: "")),
            ]),
            sources: ["App/Sources/**"],
            dependencies: [.package(product: "AtlasKit")]
        ),
    ]
)
