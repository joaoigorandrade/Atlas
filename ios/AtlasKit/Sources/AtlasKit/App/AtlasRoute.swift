import Navigation
import SwiftUI

/// Every destination that isn't a tab, as one value type. `Navigation`'s
/// `Navigator` pushes and presents these, so a screen asks for a destination by
/// name instead of owning the `sheet`/`fullScreenCover`/`NavigationLink` that
/// gets there.
public enum AtlasRoute: ModalRoute {
    /// The node drawer — a bottom sheet on mobile, sized to its own content.
    case nodeDetail(ConceptNode)
    /// One pass through the spiral. Pushed rather than covered: the phase bar
    /// already draws its own way back, and a push gets the swipe for free.
    case session(ConceptNode, phase: Phase?)
    case settings
    case calibration

    public var presentationStyle: ModalPresentation { .sheet }

    @ViewBuilder
    public var destination: some View {
        switch self {
        case .nodeDetail(let node): NodeDetailView(node: node)
        case .session(let node, let phase): SessionView(node: node, phase: phase)
        case .settings: SettingsView()
        case .calibration: CalibrationView()
        }
    }
}

/// The one stack type the app pushes into, and the one tab bar that owns four
/// of them. Named so a screen's `@EnvironmentObject` reads as what it is.
public typealias AtlasNavigator = Navigator<AtlasRoute>
public typealias AtlasTabNavigator = TabNavigator<AtlasTab, AtlasRoute>
