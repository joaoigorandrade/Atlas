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
    }
}

/// The tab bar, engraved: the web's segmented Map · Session · Review control
/// (`components/map/TopBar.tsx`) moved to the thumb. Fell small capitals on a
/// chip track, the active tab a vellum chip with a hairline ring, a double rule
/// along the top — no SF Symbols, no glass. The system bar underneath is
/// hidden; this one keeps its rule that a session is never under a tab bar.
public struct AtlasTabBar: View {
    @ObservedObject var tabs: AtlasTabNavigator
    public init(tabs: AtlasTabNavigator) { self.tabs = tabs }

    public var body: some View {
        Gate(navigator: tabs.navigator(for: tabs.selectedTab)) {
            HStack(spacing: 3) {
                ForEach(AtlasTab.allCases, id: \.self) { tab in
                    let on = tab == tabs.selectedTab
                    Button { tabs.handleSelection(tab, popToRootOnReselect: true, onReselect: nil) } label: {
                        Text(tab.title)
                            .font(.atlas(.caps, 15))
                            .tracking(0.4)
                            .foregroundStyle(on ? Palette.ink : Palette.inkMuted)
                            .frame(maxWidth: .infinity, minHeight: Metrics.tap)
                            .background(on ? Palette.card : .clear, in: .rect(cornerRadius: 2))
                            .overlay {
                                if on { RoundedRectangle(cornerRadius: 2).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                            }
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(3)
            .background(Palette.chipBg, in: .rect(cornerRadius: 3))
            .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.hairline, lineWidth: 1) }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 10)
            .padding(.bottom, 4)
            .frame(maxWidth: .infinity)
            .paper()
            .overlay(alignment: .top) { DoubleRule() }
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
