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

    var symbol: String {
        switch self {
        case .home: "house"
        case .map: "map"
        case .review: "rectangle.stack"
        case .profile: "person"
        }
    }

    /// Outlined, not the heavy filled glyphs the tab bar would pick: engraved
    /// line work belongs on this paper, solid black blocks do not.
    public var tabLabel: some View {
        Label(title, systemImage: symbol).environment(\.symbolVariants, .none)
    }

    @ViewBuilder
    public var tabContent: some View {
        switch self {
        case .home: HomeView()
        case .map: MapView()
        case .review: ReviewView()
        case .profile: ProfileView()
        }
    }
}
