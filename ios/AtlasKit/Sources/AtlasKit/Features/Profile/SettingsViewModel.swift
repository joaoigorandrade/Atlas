import Observation
import SwiftUI

/// "Configurações" — the four things a learner can change about the journey,
/// and their data. The exports and the account deletion are the whole reason
/// this screen has a model at all.
@Observable
@MainActor
final class SettingsViewModel {
    private(set) var confirmingDelete = false
    private(set) var message = ""
    private(set) var deleted = false

    private let store: AtlasStore

    init(store: AtlasStore) { self.store = store }

    func askToDelete() { confirmingDelete = true }
    func cancelDelete() { confirmingDelete = false }

    var isConfirmingDelete: Binding<Bool> {
        Binding(get: { self.confirmingDelete }, set: { self.confirmingDelete = $0 })
    }

    /// The map as it is stored, states included — the same JSON the web app
    /// exports, so a run moves between the two. Encoding walks the whole graph,
    /// so it is done on demand rather than held as a property `body` reads.
    func exportedMap() -> String {
        struct Export: Encodable { let topic: String; let graph: ConceptGraph; let states: StateMap }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try? encoder.encode(Export(topic: store.subject, graph: store.graph, states: store.states))
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Front, back, node, due — a deck any spaced-repetition app can read.
    /// A quoted field with a quote in it doubles it, which is the whole of CSV.
    func exportedCards() -> String {
        func cell(_ text: String) -> String { "\"\(text.replacingOccurrences(of: "\"", with: "\"\""))\"" }
        let rows = store.cards.map { scheduled in
            [
                cell(scheduled.card.front ?? (scheduled.card.cloze ?? []).joined(separator: " ______ ")),
                cell(scheduled.card.back),
                cell(scheduled.card.node),
                cell(scheduled.due.formatted(.iso8601)),
            ].joined(separator: ",")
        }
        return (["frente,verso,no,vencimento"] + rows).joined(separator: "\n")
    }

    /// The server wipes the data; signing out is what clears the device.
    func delete() async {
        do {
            try await store.api.deleteAccount()
            store.signOut()
            deleted = true
        } catch {
            message = ErrorCopy.sentence(for: error, doing: "apagar sua conta")
        }
    }
}
