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

    /// `restoring` and not just `restored`: the flag below is only set at the
    /// end, and two overlapping restores would send the same refresh token
    /// twice — Supabase rotates them, so the second call is the one that gets
    /// the learner signed out.
    private var restoring = false

    func restore(_ store: AtlasStore) async {
        guard !restored, !restoring else { return }
        restoring = true
        defer { restoring = false }
        await store.restore()
        onboarding = OnboardingViewModel(store: store)
        restored = true
    }

    /// A run left the store — signing out, or "Novo mapa" — so the shell is
    /// about to show onboarding again. It has to be a *fresh* machine: the one
    /// that built the last map is parked on its placement screen and still
    /// holds that map's form, graph and pending gaps.
    func restartOnboarding(_ store: AtlasStore) {
        onboarding = OnboardingViewModel(store: store)
    }

    /// The confirmation link comes back into the app as `atlas://auth/confirm`
    /// (`AtlasAuth.callbackURL`), either carrying a session in its fragment or
    /// carrying the reason it could not be spent. The web `/auth/confirm` route
    /// still redirects with `?error=` in the query, and that is read too.
    func arrived(from url: URL, into store: AtlasStore) async {
        switch AtlasAuth.callback(url) {
        case .session(let session):
            // The link *was* the sign-in: there is nothing left to tell them.
            notice = ""
            await store.signIn(with: session)
        case .failed(let code):
            notice = Self.notice(for: code)
        case .ignored:
            break
        }
    }

    /// A notice belongs to the link that arrived, not to the device. Signing out
    /// later must not resurrect a week-old "esse link expirou".
    func clearNotice() { notice = "" }

    private static func notice(for code: String) -> String {
        switch code {
        case "link", "expired", "otp_expired", "access_denied":
            return String(localized: "Esse link de confirmação expirou ou já foi usado — entre novamente abaixo.")
        case "unavailable":
            return String(localized: "Não conseguimos verificar esse link agora — não há nada de errado com sua conta. Tente o link de novo, ou entre abaixo.")
        default:
            // A reason this build does not know is still a reason the link did
            // not work: say the softer of the two, and leave a trace of which.
            AtlasLog.log.warning("unknown auth callback error: \(code, privacy: .public)")
            return String(localized: "Não conseguimos verificar esse link agora — não há nada de errado com sua conta. Tente o link de novo, ou entre abaixo.")
        }
    }
}
