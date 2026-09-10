import Navigation
import SwiftUI
import UIKit

/// The shell: it holds the store and the tab navigator, and renders. No logic
/// of its own — the web app's `AtlasApp.tsx` split, kept.
public struct RootView: View {
    @State private var store: AtlasStore
    @State private var launch = LaunchViewModel()
    /// One navigator per tab, so a stack survives a trip through another tab.
    @StateObject private var tabs = AtlasTabNavigator(initialTab: .home)
    /// The splash's own arrival — the one piece of state the shell draws with.
    @State private var settled = false
    /// The saved pass is replayed once per launch, not once per time the shell
    /// happens to be rebuilt — signing out and back in starts a new session,
    /// and that one leaves from the map like any other.
    @State private var resumed = false
    @Environment(\.scenePhase) private var scenePhase

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
            } else if store.signedIn, store.libraryFailed, store.graph.nodes.isEmpty {
                // Before onboarding on purpose: an empty library and a library
                // that could not be read look identical here, and showing the
                // map builder for the second one invites the learner to rebuild
                // a map they already have — over the row they already have.
                unreachable.transition(.opacity)
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
        .animation(Motion.enter, value: store.libraryFailed)
        .animation(Motion.enter, value: store.signedIn)
        .animation(Motion.enter, value: store.graph.nodes.isEmpty)
        .background(Palette.paper)
        .environment(store)
        .task { await launch.restore(store) }
        // The debounce sleeps two seconds and a suspended process does not
        // resume a `Task.sleep`: without this, everything done in the last beat
        // before the learner swipes up is simply dropped. The background task is
        // the window the upsert lands in.
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            let window = UIApplication.shared.beginBackgroundTask(withName: "atlas.flush")
            Task {
                await store.saveNow()
                UIApplication.shared.endBackgroundTask(window)
            }
        }
        .onOpenURL { url in Task { await launch.arrived(from: url, into: store) } }
        // Signing out takes the map with it; the stacks that were drawn over it
        // must not survive into the next learner's session.
        .onChange(of: store.signedIn) { _, signedIn in
            if !signedIn {
                // Not `resetAllTabs()`: its `popToRoot` returns early when the
                // stack is empty, which is exactly the Mapa tab's normal state
                // with the node drawer open — the previous learner's drawer
                // would survive into the next learner's map. `reset()` has no
                // such guard and clears history too.
                tabs.navigators.values.forEach { $0.reset() }
                tabs.switchTab(to: .home)
                // Including the pass that was open: the next person to hold the
                // phone must not be dropped into somebody else's Crucible.
                SessionViewModel.forget()
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

    /// Reopen the pass the last launch was in the middle of, over the Mapa tab
    /// it was pushed from — so backing out of it lands on the map, exactly
    /// where backing out of it would have landed yesterday.
    private func resume() {
        guard !resumed else { return }
        resumed = true
        guard let (node, phase) = SessionViewModel.resumable(in: store) else { return }
        tabs.navigate(to: .session(node, phase: phase), inTab: .map)
    }

    /// The library did not load. Said plainly, because the one thing the
    /// learner must not conclude is that their maps are gone.
    private var unreachable: some View {
        VStack(spacing: 16) {
            Text("Não foi possível carregar seus mapas")
                .font(.atlas(.serif, 24, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text("Eles estão salvos — foi a conexão que falhou. Tente de novo.")
                .font(.atlas(.sans, 14.5))
                .foregroundStyle(Palette.inkMuted)
                .multilineTextAlignment(.center)
            CTAButton("Tentar de novo") { Task { await store.loadLibrary() } }
                .frame(maxWidth: 280)
                .padding(.top, 6)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.paper)
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
            // A pass the app was killed in the middle of. Everything in it is
            // on the server — the reading's place, the transcript, the mastery
            // — so all that was lost was the screen, and a learner who left
            // mid-Crucible came back to "Boa noite".
            .task { resume() }
            .tint(Palette.accent)
            // A save that never landed looks exactly like one that did. It says
            // so, permanently, until the retry gets through.
            .overlay(alignment: .top) {
                if store.saveFailed {
                    Chip("Sem conexão · não salvo", dot: Palette.amberInk)
                        .transition(.opacity)
                }
            }
            .animation(Motion.enter, value: store.saveFailed)
    }
}
