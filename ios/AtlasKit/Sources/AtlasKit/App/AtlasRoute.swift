import Navigation
import SwiftUI

/// Every destination that isn't a tab, as one value type. `Navigation`'s
/// `Navigator` pushes and presents these, so a screen asks for a destination by
/// name instead of owning the `sheet`/`fullScreenCover`/`NavigationLink` that
/// gets there.
public enum AtlasRoute: @preconcurrency ModalRoute {
    /// The node drawer — a bottom sheet on mobile. It sets its own detents:
    /// the spiral plus the chips is taller than a sheet at AX type sizes.
    case nodeDetail(ConceptNode)
    /// One pass through the spiral. Pushed rather than covered: the phase bar
    /// already draws its own way back, and a push gets the swipe for free.
    /// `resumed` is a cold launch reopening the pass it was killed in — not a
    /// redo, so it must not ask for a fresh Crucible problem.
    case session(ConceptNode, phase: Phase?, resumed: Bool = false)
    /// Pushed, and deliberately keeping the tab bar: both are side trips the
    /// learner steps back out of, not a mode the app enters.
    case settings
    case calibration
    /// The Frontier Feed — pushed from the map's foot, like a session.
    case feed

    public var presentationStyle: ModalPresentation {
        switch self {
        case .nodeDetail: .sheet
        // Only read by `Navigator.present(_:)`, which this app never calls —
        // these three are pushed. Declared honestly so the first `present(_:)`
        // does not put a full session inside a half sheet.
        case .session, .settings, .calibration, .feed: .fullScreenCover
        }
    }

    /// Main-actor: every destination is a view, built where views are built.
    /// `Routable` predates that annotation, hence the `@preconcurrency`.
    @MainActor @ViewBuilder
    public var destination: some View {
        Group {
            switch self {
            // Neither has a tab bar to clear (`RootView`'s scroll margin).
            case .nodeDetail(let node): NodeDetailView(node: node).contentMargins(.bottom, 0, for: .scrollContent)
            case .session(let node, let phase, let resumed):
                SessionView(node: node, phase: phase, resumed: resumed).contentMargins(.bottom, 0, for: .scrollContent)
            case .settings: SettingsView()
            case .calibration: CalibrationView()
            case .feed: FeedView()
            }
        }
        // The system bar stays hidden on every pushed screen too: `AtlasTabBar`
        // is the one the learner sees.
        .toolbar(.hidden, for: .tabBar)
    }
}

/// The one stack type the app pushes into, and the one tab bar that owns four
/// of them. Named so a screen's `@EnvironmentObject` reads as what it is.
public typealias AtlasNavigator = Navigator<AtlasRoute>
public typealias AtlasTabNavigator = TabNavigator<AtlasTab, AtlasRoute>
