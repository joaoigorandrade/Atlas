import Navigation
import SwiftUI

/// The four destinations of the mobile shell. Session is deliberately absent:
/// it is not a destination without a selected node — it is pushed from the map.
public enum AtlasTab: String, TabRoute, CaseIterable {
    case home, map, review, profile

    var title: LocalizedStringKey {
        switch self {
        case .home: "Início"
        case .map: "Mapa"
        case .review: "Revisão"
        case .profile: "Perfil"
        }
    }

    /// The system bar is hidden (see `AtlasTabBar`); this only names the tab
    /// for the `TabView` underneath.
    public var tabLabel: some View { Text(title) }

    @ViewBuilder
    public var tabContent: some View {
        Group {
            switch self {
            case .home: HomeView()
            case .map: MapView()
            case .review: ReviewView()
            case .profile: ProfileView()
            }
        }
        .toolbar(.hidden, for: .tabBar)
        // The glass bar floats over the root; this is the room it needs, as
        // safe area, so a scroll runs on under it and a fixed footer (the
        // map's) stops above it. A pushed session is another view and gets none.
        .safeAreaPadding(.bottom, AtlasTabBar.reserve)
    }
}

/// The tab bar: the web's segmented Map · Session · Review control
/// (`components/map/TopBar.tsx`) moved to the thumb and floated on Liquid
/// Glass, so the page scrolls on underneath it. Fell small capitals; the
/// active tab a vellum capsule that slides between them. The system bar
/// underneath is hidden; this one keeps its rule that a session is never
/// under a tab bar.
public struct AtlasTabBar: View {
    @ObservedObject var tabs: AtlasTabNavigator
    @Namespace private var pill
    public init(tabs: AtlasTabNavigator) { self.tabs = tabs }

    /// What a tab's root leaves clear at the bottom: the capsule and the gap
    /// above it. Its scroll content runs on under the glass.
    static let reserve: CGFloat = Metrics.tap + 8 + 12

    public var body: some View {
        Gate(navigator: tabs.navigator(for: tabs.selectedTab)) {
            HStack(spacing: 2) {
                ForEach(AtlasTab.allCases, id: \.self) { tab in
                    let on = tab == tabs.selectedTab
                    Button {
                        withAnimation(Motion.standard) {
                            tabs.handleSelection(tab, popToRootOnReselect: true, onReselect: nil)
                        }
                    } label: {
                        Text(tab.title)
                            .font(.atlas(.caps, 15))
                            .tracking(0.4)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .foregroundStyle(on ? Palette.ink : Palette.inkMuted)
                            .frame(maxWidth: .infinity, minHeight: Metrics.tap)
                            .background {
                                if on {
                                    Capsule().fill(Palette.card.opacity(0.85))
                                        .overlay { Capsule().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                                        .matchedGeometryEffect(id: "on", in: pill)
                                }
                            }
                            .contentShape(.capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(4)
            .glassEffect(.regular.tint(Palette.paper.opacity(0.35)).interactive(), in: .capsule)
            .padding(.horizontal, Metrics.gutter)
            .padding(.bottom, 4)
        }
    }

    /// Watches the selected tab's own stack, so the bar steps aside the moment
    /// a session is pushed onto it.
    private struct Gate<Bar: View>: View {
        @ObservedObject var navigator: AtlasNavigator
        @ViewBuilder var bar: Bar
        var body: some View {
            let inSession = navigator.path.contains { if case .session = $0 { true } else { false } }
            if !inSession { bar }
        }
    }
}
