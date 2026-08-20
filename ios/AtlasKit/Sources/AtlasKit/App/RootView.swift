import Navigation
import SwiftUI

/// The shell: it holds the store and the tab navigator, and renders. No logic
/// of its own — the web app's `AtlasApp.tsx` split, kept.
public struct RootView: View {
    @State private var store: AtlasStore
    @State private var launch = LaunchViewModel()
    /// One navigator per tab, so a stack survives a trip through another tab.
    @StateObject private var tabs = AtlasTabNavigator(initialTab: .home)

    public init(store: AtlasStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        Group {
            if !launch.restored {
                // Nothing is drawn until the stored session has been picked up,
                // or the app flashes the login screen at a signed-in learner.
                Color.clear
            } else if let onboarding = launch.onboarding, store.signedIn, store.graph.nodes.isEmpty {
                flow(onboarding)
            } else if store.signedIn {
                shell
            } else {
                AuthView(notice: launch.notice)
            }
        }
        .background(Palette.paper)
        .environment(store)
        .task { await launch.restore(store) }
        .onOpenURL { launch.arrived(from: $0) }
        // Signing out takes the map with it; the stacks that were drawn over it
        // must not survive into the next learner's session.
        .onChange(of: store.signedIn) { _, signedIn in
            if !signedIn { tabs.resetAllTabs() }
        }
    }

    /// Onboarding, in the order the design draws it: the form, the assembly
    /// beat, then the fork into the placement. One switch, no navigation stack —
    /// none of these three is a place you go back to.
    @ViewBuilder
    private func flow(_ onboarding: OnboardingViewModel) -> some View {
        switch onboarding.stage {
        case .welcome: WelcomeView(onboarding: onboarding)
        case .building: BuildingView(onboarding: onboarding)
        case .placement: PlacementView(onboarding: onboarding)
        }
    }

    private var shell: some View {
        NavigationTabView(tabs)
            .environmentObject(tabs)
            .tint(Palette.accent)
    }
}
