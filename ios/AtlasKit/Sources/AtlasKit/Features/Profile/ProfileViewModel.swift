import Observation
import SwiftUI

/// "Perfil" — who is signed in and what the run adds up to. Every figure and
/// every sentence on the screen is derived here.
@Observable
@MainActor
final class ProfileViewModel {
    private let store: AtlasStore

    init(store: AtlasStore) { self.store = store }

    var email: String { store.session?.email ?? "" }
    var streak: String { "\(store.streak)" }
    var masteredShare: String { store.mastered.formatted(.percent.precision(.fractionLength(0))) }
    var masteredCount: String { "\(store.masteredCount)" }
    var cardCount: String { "\(store.cards.count)" }
    var goal: LocalizedStringKey { store.goal.label }

    /// The interests as the learner wrote them, split once rather than in `body`.
    var interests: [String] {
        store.interests
            .split(whereSeparator: { ",;".contains($0) })
            .map { String($0).trimmed }
            .filter { !$0.isEmpty }
    }

    var queueLine: LocalizedStringKey {
        let due = store.queue.count
        return due == 0
            ? "Fila limpa hoje"
            : "\(due) pendentes · ~\(Int((Double(due) * cardMinutes).rounded())) min hoje"
    }

    func signOut() { store.signOut() }
}
