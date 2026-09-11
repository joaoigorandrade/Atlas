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
/// The web app this build talks to. Prod unless the environment names another
/// one — see the note beside `ATLAS_BASE_URL` below.
/// `TUIST_` is Tuist's own prefix — the manifest runs sandboxed and sees no
/// other environment. `TUIST_ATLAS_BASE_URL=http://localhost:3000`.
let devBaseURL: String? = {
    let named = Environment.atlasBaseUrl.getString(default: "")
    return named.isEmpty ? nil : named
}()

/// ATS blocks plaintext HTTP, which is exactly what a local dev server serves.
/// Added only for a local build, so a shipped one keeps the default refusal.
let localNetworkingATS: [String: Plist.Value] =
    devBaseURL?.hasPrefix("http://") == true
        ? ["NSAppTransportSecurity": ["NSAllowsLocalNetworking": true]]
        : [:]

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
                // The static launch screen is a single colour, and a named
                // one is the only kind that can answer to the appearance —
                // hence the one colour set in the catalogue. It is `paper` in
                // both schemes, so the wordmark `RootView` paints over it
                // arrives out of the launch screen rather than after a flash of
                // the wrong ground. No `UIUserInterfaceStyle` key on purpose:
                // omitting it is what lets the app follow the device.
                "UILaunchScreen": ["UIColorName": "LaunchPaper"],
                "CFBundleDisplayName": "Atlas",
                // Voice: without both, the mic beside every free-text answer
                // kills the app the first time it is pressed.
                "NSMicrophoneUsageDescription": "Para responder falando, em vez de digitar.",
                "NSSpeechRecognitionUsageDescription": "Para transcrever o que você fala nas respostas.",
                // Screen 4 — the confirmation link comes back into the app.
                "CFBundleURLTypes": [["CFBundleURLSchemes": ["atlas"]]],
                // ponytail: one constant, overridable by an env var at generate
                // time — `ATLAS_BASE_URL=http://localhost:3000 tuist generate`
                // is what points a simulator build at a fixture-mode dev
                // server, so a walk through the phases costs no model calls.
                "ATLAS_BASE_URL": .string(devBaseURL ?? "https://atlas-tan-two.vercel.app"),
                // The three faces in `Face`. Variable files: CoreText exposes
                // their named instances (Medium, SemiBold, …), so
                // `Font.custom(face.rawValue, …).weight(…)` picks a real cut
                // instead of a synthetic one.
                "UIAppFonts": [
                    "Newsreader.ttf",
                    "InstrumentSans.ttf",
                    "SplineSansMono.ttf",
                ],
            ].merging(localNetworkingATS) { a, _ in a }),
            sources: ["App/Sources/**"],
            resources: ["App/Resources/**"],
            dependencies: [.package(product: "AtlasKit")]
        ),
    ]
)
