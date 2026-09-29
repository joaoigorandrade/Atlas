import Observation
import SwiftUI

/// "Configurações" — the four things a learner can change about the journey,
/// and their data. The exports and the account deletion are the whole reason
/// this screen has a model at all.
@Observable
@MainActor
final class SettingsViewModel {
    private(set) var confirmingDelete = false
    /// Set the moment the language changes: the content switches now, and the
    /// alert says when the interface follows.
    private(set) var languageChanged = false
    /// The daily review reminder, and whether the system refused it.
    private(set) var reminderOn = Defaults.reminderOn
    private(set) var reminderDenied = false
    var reminderTime: Date {
        get { Calendar.current.date(bySettingHour: Defaults.reminderMinutes / 60,
                                    minute: Defaults.reminderMinutes % 60, second: 0, of: .now) ?? .now }
        set {
            let parts = Calendar.current.dateComponents([.hour, .minute], from: newValue)
            Defaults.reminderMinutes = (parts.hour ?? 19) * 60 + (parts.minute ?? 0)
            Task { await applyReminder() }
        }
    }
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

    func choose(goal: GoalKind) { store.goal = goal }
    func choose(dailyTarget minutes: Int) { store.dailyTarget = minutes }

    func askToDelete() { confirmingDelete = true }
    func cancelDelete() { confirmingDelete = false }

    /// The content language switches at once — it is what the model is asked
    /// to write in. The interface is read out of `AppleLanguages` at launch, so
    /// it follows on the next open, or straight away through the app's own
    /// language in the iPhone's settings, which relaunches it the sanctioned
    /// way. The app used to `exit(0)` here, which reads as a crash.
    /// Picking the language already on screen changes nothing and asks nothing.
    func choose(language: String) {
        guard language != store.language else { return }
        store.language = language
        languageChanged = true
    }

    var isLanguageChanged: Binding<Bool> {
        Binding(get: { self.languageChanged }, set: { self.languageChanged = $0 })
    }

    func toggleReminder(_ on: Bool) {
        reminderOn = on
        Defaults.reminderOn = on
        Task { await applyReminder() }
    }

    private func applyReminder() async {
        reminderDenied = !(await Reminders.apply())
        if reminderDenied {
            reminderOn = false
            Defaults.reminderOn = false
        }
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
        let rows = store.cards.map { card in
            // The due date rides inside the scheduler state, which this client
            // carries but never interprets — read as text, exported as text.
            let due: String
            if case .string(let value)? = card.fsrs.fields?["due"] { due = value } else { due = "" }
            return [
                cell(card.front ?? (card.cloze ?? []).joined(separator: " ______ ")),
                cell(card.back),
                cell(card.nodeId),
                cell(due),
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
