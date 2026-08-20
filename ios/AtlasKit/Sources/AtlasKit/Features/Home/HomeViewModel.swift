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

    var greeting: String {
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
        queueIsEmpty ? "Fila limpa" : "\(queue.count) cartões pendentes"
    }

    var reviewNote: String {
        queueIsEmpty
            ? "Nada a recuperar agora. O próximo cartão volta assim que a memória começar a esfriar."
            : "~\(Int((Double(queue.count) * cardMinutes).rounded())) min · no momento exato em que essas memórias estão prestes a desvanecer."
    }

    var reviewAction: String { queueIsEmpty ? "Abrir a revisão →" : "Iniciar revisão →" }

    var frontier: [ConceptNode] { store.frontier }
    var frontierHeadline: String { frontier.first?.label ?? "Seu mapa ainda está vazio" }
    var frontierNote: String {
        frontier.first?.summary ?? "Monte um mapa para acender sua primeira fronteira."
    }
    var frontierLine: String {
        "Você está na fronteira de \(frontier.count) conceitos. Continue de onde parou."
    }

    var hasRun: Bool { !store.subject.isEmpty }
    var subject: String { store.subject }
    var goal: String { store.goal.label }
    var mastered: Double { store.mastered }
    var streak: Int { store.streak }
    var email: String? { store.session?.email }
}
