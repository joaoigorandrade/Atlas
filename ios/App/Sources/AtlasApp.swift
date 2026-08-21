import AtlasKit
import SwiftUI

/// The entry point, and nothing else: the store is built here and `RootView` is
/// the app from there. `ATLAS_BASE_URL` is the web app (read-aloud and the
/// kinds not yet ported); Supabase and OpenRouter are reached directly, with
/// the keys in `Secrets.swift`.
@main
struct AtlasApp: App {
    private let store = AtlasStore(
        api: AtlasAPI(baseURL: url("ATLAS_BASE_URL")),
        auth: AtlasAuth()
    )

    var body: some Scene {
        WindowGroup { RootView(store: store) }
    }
}

private func setting(_ key: String) -> String {
    Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
}

/// A missing or malformed value is a generation-time mistake, not a runtime
/// state to degrade into — every request the app makes needs it.
private func url(_ key: String) -> URL {
    guard let url = URL(string: setting(key)), url.scheme != nil else {
        fatalError("\(key) is missing from Info.plist — set it in .env.local and re-run `tuist generate`.")
    }
    return url
}
