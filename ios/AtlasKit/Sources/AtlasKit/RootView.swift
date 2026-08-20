import SwiftUI

/// The four destinations of the mobile shell. Session is deliberately absent:
/// it is not a destination without a selected node — it is pushed from the map.
public enum Tab: String, CaseIterable, Identifiable {
    case home, map, review, profile
    public var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Início"
        case .map: "Mapa"
        case .review: "Revisão"
        case .profile: "Perfil"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .map: "point.3.connected.trianglepath.dotted"
        case .review: "rectangle.on.rectangle"
        case .profile: "person"
        }
    }
}

/// The shell: it holds the store and renders. No logic of its own — the web
/// app's `AtlasApp.tsx` split, kept.
public struct RootView: View {
    @State private var store: AtlasStore
    @State private var tab: Tab = .home
    /// Nothing is drawn until the stored session has been picked up, or the
    /// app flashes the login screen at a learner who is already signed in.
    @State private var restored = false
    /// The sentence a confirmation link came back with, if the app was opened
    /// by one — screen 4.
    @State private var notice = ""
    /// Screens 5–8, alive only while there is no map. It owns the run it is
    /// building and hands it to the store in one write.
    @State private var onboarding: Onboarding?

    public init(store: AtlasStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        Group {
            if !restored {
                Color.clear
            } else if let onboarding, store.signedIn, store.graph.nodes.isEmpty {
                flow(onboarding)
            } else if store.signedIn {
                shell
            } else {
                AuthView(notice: notice)
            }
        }
        .background(Palette.paper)
        .environment(store)
        .task {
            await store.restore()
            onboarding = Onboarding(store: store)
            restored = true
        }
        .onOpenURL { url in
            // The confirmation link lands on the web app, which redirects back
            // with `?error=` when it is spent. Same reasons as `/login`.
            let error = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "error" }?.value
            switch error {
            case "link", "expired":
                notice = "Esse link de confirmação expirou ou já foi usado — entre novamente abaixo."
            case "unavailable":
                notice = "Não conseguimos verificar esse link agora — não há nada de errado com sua conta. Tente o link de novo, ou entre abaixo."
            default: break
            }
        }
    }

    /// Onboarding, in the order the design draws it: the form, the assembly
    /// beat, then the fork into the placement. One switch, no navigation stack —
    /// none of these three is a place you go back to.
    @ViewBuilder
    private func flow(_ onboarding: Onboarding) -> some View {
        switch onboarding.stage {
        case .welcome: WelcomeView(onboarding: onboarding)
        case .building: BuildingView(onboarding: onboarding)
        case .placement: PlacementView(onboarding: onboarding)
        }
    }

    private var shell: some View {
        TabView(selection: $tab) {
            ForEach(Tab.allCases) { destination in
                NavigationStack {
                    screen(for: destination)
                        .background(Palette.paper)
                }
                .tag(destination)
                .tabItem { Label(destination.title, systemImage: destination.symbol) }
            }
        }
        .tint(Palette.accent)
    }

    @ViewBuilder
    private func screen(for destination: Tab) -> some View {
        switch destination {
        case .home: HomeView(tab: $tab)
        case .map: MapView()
        case .review: ReviewView()
        case .profile: ProfileView(tab: $tab)
        }
    }
}

/// A screen that has a slot in the shell but no implementation yet.
/// Delete each one as ios/PLAN.md's screen table is worked through.
struct Pending: View {
    let name: String
    init(_ name: String) { self.name = name }
    var body: some View {
        VStack(spacing: 8) {
            Kicker("Em construção")
            Text(name).font(.atlas(.serif, 26)).foregroundStyle(Palette.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.paper)
    }
}
