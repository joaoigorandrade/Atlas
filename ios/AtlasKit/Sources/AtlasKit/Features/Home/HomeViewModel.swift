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

    private var queue: [ScheduledCard] { store.queue }
    var queueIsEmpty: Bool { queue.isEmpty }

    /// The queue, framed in minutes against the daily target — never a wall of
    /// cards, and never a number that isn't due.
    var reviewHeadline: String {
        queueIsEmpty ? String(localized: "Fila limpa") : String(localized: "\(queue.count) cartões pendentes")
    }

    var reviewNote: String {
        queueIsEmpty
            ? String(localized: "Nada a recuperar agora. O próximo cartão volta assim que a memória começar a esfriar.")
            : String(localized: "~\(Int((Double(queue.count) * cardMinutes).rounded())) min · no momento exato em que essas memórias estão prestes a desvanecer.")
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
    var maps: [RunSnapshot] { store.maps }
    func isOpen(_ map: RunSnapshot) -> Bool { map.subject == store.subject }

    /// The chip each card carries: which one the tabs are currently showing.
    func status(_ map: RunSnapshot) -> LocalizedStringKey {
        isOpen(map) ? "Em andamento" : "Salvo"
    }

    func frontierCount(_ map: RunSnapshot) -> Int {
        isOpen(map) ? frontier.count : map.frontierCount
    }

    /// Tapping a card. The open map is already on screen, so this only has work
    /// to do for the others — the view decides where to go afterwards.
    func open(_ map: RunSnapshot) async {
        await store.switchTo(map)
    }

    /// "+ Novo mapa". The store flushes and clears the open run, which is what
    /// puts the shell on onboarding; nothing is deleted.
    func newMap() async {
        await store.newMap()
    }
}
