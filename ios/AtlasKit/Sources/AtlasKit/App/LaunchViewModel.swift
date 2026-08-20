import Observation
import SwiftUI

/// What the shell needs before it can draw anything: whether the stored session
/// has been picked up, the onboarding machine for a learner with no map, and
/// the sentence a spent confirmation link came back with.
@Observable
@MainActor
final class LaunchViewModel {
    private(set) var restored = false
    /// Screens 5–8, alive only while there is no map. It owns the run it is
    /// building and hands it to the store in one write.
    private(set) var onboarding: OnboardingViewModel?
    /// Screen 4 — the sentence the app was opened with, if it was opened by a
    /// confirmation link that had already been spent.
    private(set) var notice = ""

    func restore(_ store: AtlasStore) async {
        guard !restored else { return }
        await store.restore()
        onboarding = OnboardingViewModel(store: store)
        restored = true
    }

    /// The confirmation link lands on the web app, which redirects back with
    /// `?error=` when it is spent — the same codes `/login` reads.
    func arrived(from url: URL) {
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
