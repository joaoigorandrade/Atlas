import Observation
import SwiftUI

/// "Início" holds no state of its own — every number on it is a reading of the
/// store. This is where those readings are computed, so `body` renders strings
/// instead of deriving them.
@Observable
@MainActor
final class HomeViewModel {
    private let store: AtlasStore

    init(store: AtlasStore) { self.store = store }

    var greeting: LocalizedStringKey {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<12: "Bom dia"
        case ..<18: "Boa tarde"
        default: "Boa noite"
        }
    }

    var today: String { Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)) }

    /// Cards due right now, counted from the store rather than fetched: the
    /// dashboard says how much is waiting, and the deck itself — the order and
    /// the intervals — is the server's answer, asked for when Review opens.
    private var dueCount: Int { store.dueCount }
    var queueIsEmpty: Bool { dueCount == 0 }

    /// The queue, framed in minutes against the daily target — never a wall of
    /// cards, and never a number that isn't due.
    var reviewHeadline: String {
        queueIsEmpty ? String(localized: "Fila limpa") : String(localized: "\(dueCount) cartões pendentes")
    }

    var reviewNote: String {
        queueIsEmpty
            ? String(localized: "Nada a recuperar agora. O próximo cartão volta assim que a memória começar a esfriar.")
            : String(localized: "~\(Int((Double(dueCount) * cardMinutes).rounded())) min · no momento exato em que essas memórias estão prestes a desvanecer.")
    }

    var reviewAction: LocalizedStringKey { queueIsEmpty ? "Abrir a revisão →" : "Iniciar revisão →" }

    var frontier: [ConceptNode] { store.frontier }
    /// The node's own label when there is one, so this is a String the view
    /// renders verbatim — the fallback is the only half that is copy.
    var frontierHeadline: String { frontier.first?.label ?? String(localized: "Seu mapa ainda está vazio") }
    var frontierNote: String {
        frontier.first?.summary ?? String(localized: "Monte um mapa para acender sua primeira fronteira.")
    }
    var frontierLine: LocalizedStringKey {
        "Você está na fronteira de \(frontier.count) conceitos. Continue de onde parou."
    }

    var hasRun: Bool { !store.subject.isEmpty }
    var subject: String { store.subject }
    var goal: LocalizedStringKey { store.goal.label }
    var mastered: Double { store.mastered }
    var streak: Int { store.streak }
    var email: String? { store.session?.email }

    // MARK: - Seus mapas

    /// Every saved map, freshest first. The open one is in here, answered from
    /// live state — see `AtlasStore.maps`.
    var maps: [AtlasRun] { store.maps }
    func isOpen(_ map: AtlasRun) -> Bool { map.subject == store.subject }

    /// The chip each card carries: which one the tabs are currently showing.
    func status(_ map: AtlasRun) -> LocalizedStringKey {
        isOpen(map) ? "Em andamento" : "Salvo"
    }

    func frontierCount(_ map: AtlasRun) -> Int {
        isOpen(map) ? frontier.count : map.frontierCount
    }

    /// Tapping a card. The open map is already on screen, so this only has work
    /// to do for the others — the view decides where to go afterwards.
    func open(_ map: AtlasRun) async {
        await store.switchTo(map)
    }

    // MARK: - Excluir um mapa

    /// The card the learner is being asked about, and the failure if the delete
    /// did not land. Nothing else on this screen can fail.
    private(set) var pendingDelete: AtlasRun?
    private(set) var message = ""
    /// The same subject again, held where the alert cannot take it back:
    /// dismissing clears `pendingDelete` through the binding, and SwiftUI does
    /// that *before* the confirmed button's task gets to run — which is exactly
    /// how "Excluir" used to delete nothing at all.
    private var confirmed = ""

    func askToDelete(_ map: AtlasRun) {
        pendingDelete = map
        confirmed = map.id
        confirmedSubject = map.subject
    }

    func cancelDelete() {
        pendingDelete = nil
        confirmed = ""
    }

    var isConfirmingDelete: Binding<Bool> {
        Binding(get: { self.pendingDelete != nil }, set: { if !$0 { self.pendingDelete = nil } })
    }

    /// Named while the alert still has the card. `confirmed` is an id, which
    /// is not something to show a learner, so the subject is held beside it.
    private var confirmedSubject = ""

    var deleteAsk: String {
        String(localized: "Excluir “\(pendingDelete?.subject ?? confirmedSubject)”?")
    }

    /// Confirmed. Deleting the open map clears the live run, which is what puts
    /// the shell back on onboarding when it was the last one — the store does
    /// all of that; this only speaks the failure.
    func delete() async {
        let id = confirmed
        guard !id.isEmpty else { return }
        cancelDelete()
        do {
            try await store.deleteMap(id)
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "excluir esse mapa"))
        }
    }

    /// "+ Novo mapa". The store flushes and clears the open run, which is what
    /// puts the shell on onboarding; nothing is deleted.
    func newMap() async {
        await store.newMap()
    }
}
