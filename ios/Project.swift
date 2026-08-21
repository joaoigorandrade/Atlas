import ProjectDescription

// The app talks to the deployed web app and to nothing else — auth included
// (`/api/auth`), so no Supabase key ships with it either. A phone is not on the
// developer's machine's network, and a build that points at a laptop is a build
// that works for exactly one person, so the host is a constant here rather than
// an environment lift.
// ponytail: one constant, no remote config and no per-build lookup. A second
// environment (staging) is what would earn one back.
// pt-BR is the source language: the copy in the code *is* the Portuguese, and
// `App/Resources/Localizable.xcstrings` carries the English beside it. Both
// regions are declared so the catalogue compiles an `en.lproj` as well.
let project = Project(
    name: "Atlas",
    options: .options(developmentRegion: "pt-BR"),
    packages: [.local(path: "AtlasKit")],
    targets: [
        .target(
            name: "Atlas",
            destinations: .iOS,
            product: .app,
            bundleId: "com.joaoigor.atlas",
            deploymentTargets: .iOS("26.0"),
            infoPlist: .extendingDefault(with: [
                "UILaunchScreen": ["UIColorName": ""],
                "CFBundleDisplayName": "Atlas",
                // Voice: without both, the mic beside every free-text answer
                // kills the app the first time it is pressed.
                "NSMicrophoneUsageDescription": "Para responder falando, em vez de digitar.",
                "NSSpeechRecognitionUsageDescription": "Para transcrever o que você fala nas respostas.",
                // Screen 4 — the confirmation link comes back into the app.
                "CFBundleURLTypes": [["CFBundleURLSchemes": ["atlas"]]],
                "ATLAS_BASE_URL": "https://atlas-tan-two.vercel.app",
                // The serif in `Face.serif`. One variable file: CoreText
                // exposes its named instances (Medium, SemiBold, …), so
                // `Font.custom("Newsreader", …).weight(…)` picks a real cut
                // instead of a synthetic one.
                "UIAppFonts": ["Newsreader.ttf"],
            ]),
            sources: ["App/Sources/**"],
            resources: ["App/Resources/**"],
            dependencies: [.package(product: "AtlasKit")]
        ),
    ]
)
