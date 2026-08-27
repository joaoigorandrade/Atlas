import Navigation
import Testing
@testable import AtlasKit

/// The sign-out reset, pinned. `resetAllTabs()` looked like it did this and did
/// not: `popToRoot` returns before dismissing modals when the stack is empty,
/// which is exactly the Mapa tab with the node drawer open — so one learner's
/// drawer rode into the next learner's session.
@MainActor
struct NavigationResetTests {
    @Test func signOutClearsAnOpenSheetOnAnEmptyStack() {
        let tabs = AtlasTabNavigator(initialTab: .home)
        let map = tabs.navigator(for: .map)
        map.openSheet(.nodeDetail(ConceptNode(id: "a", label: "A")))
        tabs.switchTab(to: .profile)

        // What RootView does on `signedIn == false`.
        tabs.navigators.values.forEach { $0.reset() }
        tabs.switchTab(to: .home)

        #expect(map.activeSheet == nil)
        #expect(tabs.selectedTab == .home)
    }
}
