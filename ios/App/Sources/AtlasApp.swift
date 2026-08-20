import AtlasKit
import SwiftUI

/// The entry point, and nothing else: the three values Project.swift baked into
/// Info.plist become the store, and `RootView` is the app from there.
@main
struct AtlasApp: App {
    private let store = AtlasStore(
        api: AtlasAPI(baseURL: url("ATLAS_BASE_URL")),
        auth: AtlasAuth(baseURL: url("SUPABASE_URL"), apiKey: setting("SUPABASE_PUBLISHABLE_KEY"))
    )

    var body: some Scene {
        WindowGroup { RootView(store: store) }
    }
}

private func setting(_ key: String) -> String {
    Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
}

/// A missing or malformed value is a generation-time mistake, not a runtime
/// state to degrade into — every request the app makes needs all three.
private func url(_ key: String) -> URL {
    guard let url = URL(string: setting(key)), url.scheme != nil else {
        fatalError("\(key) is missing from Info.plist — set it in .env.local and re-run `tuist generate`.")
    }
    return url
}
