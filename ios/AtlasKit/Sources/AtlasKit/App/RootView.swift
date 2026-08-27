import Navigation
import SwiftUI

/// The shell: it holds the store and the tab navigator, and renders. No logic
/// of its own — the web app's `AtlasApp.tsx` split, kept.
public struct RootView: View {
    @State private var store: AtlasStore
    @State private var launch = LaunchViewModel()
    /// One navigator per tab, so a stack survives a trip through another tab.
    @StateObject private var tabs = AtlasTabNavigator(initialTab: .home)
    /// The splash's own arrival — the one piece of state the shell draws with.
    @State private var settled = false

    public init(store: AtlasStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        Group {
            if !launch.restored || store.opening {
                // Nothing of the app is drawn until the stored session has been
                // picked up — and again while a fresh sign-in pulls its library,
                // or the map lands on top of a flash of onboarding. What is
                // drawn is the wordmark, on the same paper the static launch
                // screen ends on, so the hand-off is invisible and the app
                // arrives out of it rather than after it.
                splash.transition(.opacity)
            } else if let onboarding = launch.onboarding, store.signedIn, store.graph.nodes.isEmpty {
                flow(onboarding).transition(.opacity)
            } else if store.signedIn {
                shell.transition(.opacity)
            } else {
                AuthView(notice: launch.notice).transition(.opacity)
            }
        }
        // Signing in, finishing onboarding and signing out all swap the whole
        // app underneath the learner. A cut there reads as a relaunch.
        .animation(Motion.enter, value: launch.restored)
        .animation(Motion.enter, value: store.opening)
        .animation(Motion.enter, value: store.signedIn)
        .animation(Motion.enter, value: store.graph.nodes.isEmpty)
        .background(Palette.paper)
        .environment(store)
        .task { await launch.restore(store) }
        .onOpenURL { url in Task { await launch.arrived(from: url, into: store) } }
        // Signing out takes the map with it; the stacks that were drawn over it
        // must not survive into the next learner's session.
        .onChange(of: store.signedIn) { _, signedIn in
            if !signedIn {
                tabs.resetAllTabs()
                // The auth screen is about to be rebuilt: it must not open
                // carrying the notice from a link this learner already dealt with.
                launch.clearNotice()
            }
        }
        // The map emptying is what puts the shell back on onboarding, and both
        // ways in there — signing out and starting a second map — need the
        // machine rebuilt rather than the finished one re-shown.
        .onChange(of: store.graph.nodes.isEmpty) { _, empty in
            if empty { launch.restartOnboarding(store) }
        }
    }

    /// The first beat of every launch: the wordmark on paper, settling as the
    /// stored session is picked up. It fades up rather than cutting in, so a
    /// restore that finishes in a frame reads as one arrival and not a flash.
    private var splash: some View {
        VStack(spacing: 18) {
            Text(verbatim: "Atlas")
                .font(.atlas(.serif, 34, weight: .semibold))
                .foregroundStyle(Palette.ink)
            AtlasPulse(tint: Palette.inkGhost, size: 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.paper)
        .scaleEffect(settled ? 1 : 0.96)
        .opacity(settled ? 1 : 0)
        .task { withAnimation(Motion.enter) { settled = true } }
    }

    /// Onboarding, in the order the design draws it: the form, the assembly
    /// beat, then the fork into the placement. One switch, no navigation stack —
    /// none of these three is a place you go back to.
    @ViewBuilder
    private func flow(_ onboarding: OnboardingViewModel) -> some View {
        Group {
            switch onboarding.stage {
            case .welcome: WelcomeView(onboarding: onboarding)
            case .building: BuildingView(onboarding: onboarding)
            case .placement: PlacementView(onboarding: onboarding)
            }
        }
        // Three beats of one arrival, not three screens: they cross-fade in
        // place over the map assembling behind them.
        .transition(.opacity)
        .animation(Motion.enter, value: onboarding.stage)
    }

    private var shell: some View {
        NavigationTabView(tabs)
            .environmentObject(tabs)
            .tint(Palette.accent)
    }
}
