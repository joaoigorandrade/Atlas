import AtlasKit
import SwiftUI

/// The entry point, and nothing else: the store is built here and `RootView` is
/// the app from there. `ATLAS_BASE_URL` is the web app (read-aloud and the
/// kinds not yet ported); Supabase and OpenRouter are reached directly, with
/// the keys in `Secrets.swift`.
@main
struct AtlasApp: App {
    /// Nil is a build that was generated without `ATLAS_BASE_URL`. It is a
    /// generation-time mistake either way, but a `fatalError` on a TestFlight
    /// build is an unattributable crash — a screen naming the missing key is
    /// what gets it fixed.
    private static let baseURL = URL(string: setting("ATLAS_BASE_URL")).flatMap { $0.scheme == nil ? nil : $0 }
    private let store = AtlasStore(
        api: AtlasAPI(baseURL: AtlasApp.baseURL ?? URL(string: "https://invalid.atlas.local")!),
        auth: AtlasAuth()
    )

    var body: some Scene {
        WindowGroup {
            if AtlasApp.baseURL == nil { misconfigured } else { RootView(store: store) }
        }
    }

    private var misconfigured: some View {
        VStack(spacing: 12) {
            Text(verbatim: "Atlas")
                .font(.atlas(.serif, 30, weight: .semibold))
                .foregroundStyle(Palette.ink)
            Text(verbatim: "ATLAS_BASE_URL is missing from Info.plist — set it in .env.local and re-run `tuist generate`.")
                .font(.atlas(.sans, 14))
                .foregroundStyle(Palette.inkMuted)
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.paper)
    }
}

private func setting(_ key: String) -> String {
    Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
}
