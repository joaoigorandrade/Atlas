import Observation
import SwiftUI

/// "Configurações" — the four things a learner can change about the journey,
/// and their data. The exports and the account deletion are the whole reason
/// this screen has a model at all.
@Observable
@MainActor
final class SettingsViewModel {
    private(set) var confirmingDelete = false
    /// Set the moment the language changes — the interface is still drawn in
    /// the old one until the process restarts.
    private(set) var restarting = false
    private(set) var message = ""
    /// The two exports, produced once when the screen opens rather than every
    /// time `body` runs — `ShareLink` takes a value, and encoding the whole
    /// graph on each redraw is the kind of work a scroll can feel.
    private(set) var exportedMap = "{}"
    private(set) var exportedCards = ""

    private let store: AtlasStore

    init(store: AtlasStore) {
        self.store = store
        exportedMap = makeExportedMap()
        exportedCards = makeExportedCards()
    }

    func askToDelete() { confirmingDelete = true }
    func cancelDelete() { confirmingDelete = false }

    /// The interface language is read out of `AppleLanguages` once, at launch,
    /// so a switch here is only half done until the app is started again.
    /// Picking the language already on screen changes nothing and asks nothing.
    func choose(language: String) {
        guard language != store.language else { return }
        store.language = language
        restarting = true
    }

    var isRestarting: Binding<Bool> {
        Binding(get: { self.restarting }, set: { self.restarting = $0 })
    }

    /// Flush first: the run saves on a two-second debounce, and the language is
    /// part of the row.
    /// ponytail: `exit(0)` is the only way to end the process from inside the
    /// app, and it looks like a crash to iOS. Fine for a deliberate tap behind
    /// an alert; if this ever ships to the App Store, drop the button and let
    /// the learner reopen the app themselves.
    func restart() async {
        await store.saveNow()
        exit(0)
    }

    var isConfirmingDelete: Binding<Bool> {
        Binding(get: { self.confirmingDelete }, set: { self.confirmingDelete = $0 })
    }

    /// The map as it is stored, states included — the same JSON the web app
    /// exports, so a run moves between the two. Encoding walks the whole graph,
    /// so it is done on demand rather than held as a property `body` reads.
    private func makeExportedMap() -> String {
        struct Export: Encodable { let topic: String; let graph: ConceptGraph; let states: StateMap }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try? encoder.encode(Export(topic: store.subject, graph: store.graph, states: store.states))
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Front, back, node, due — a deck any spaced-repetition app can read.
    /// A quoted field with a quote in it doubles it, which is the whole of CSV.
    private func makeExportedCards() -> String {
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
            // Nothing to flush to: the row went with the account.
            await store.signOut(flush: false)
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "apagar sua conta"))
        }
    }
}
