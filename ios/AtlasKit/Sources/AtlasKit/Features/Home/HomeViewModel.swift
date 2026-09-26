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

    /// Cards in today's session, counted from the store rather than fetched:
    /// the dashboard says how much is waiting, and the deck itself — the order
    /// and the intervals — is the server's answer, asked for when Review opens.
    ///
    /// `dueToday` and not `dueCount`: the deck is budgeted to half the daily
    /// target, so the raw due pile is a promise Review does not keep.
    private var dueCount: Int { store.dueToday }
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
    /// renders verbatim — the fallbacks are the only half that is copy.
    ///
    /// Two fallbacks, not one: a map with nothing open on its frontier is not a
    /// learner with no map. Sending someone who has been working all week to
    /// "monte um mapa" is the one sentence on this screen that can't be true.
    var frontierHeadline: String {
        if let label = frontier.first?.label { return label }
        return hasRun
            ? String(localized: "Nada na fronteira agora")
            : String(localized: "Seu mapa ainda está vazio")
    }
    var frontierNote: String {
        if let summary = frontier.first?.summary { return summary }
        return hasRun
            ? String(localized: "Todo conceito liberado já está em andamento. Abra o mapa para levar um adiante.")
            : String(localized: "Monte um mapa para acender sua primeira fronteira.")
    }
    var frontierLine: LocalizedStringKey {
        guard !frontier.isEmpty else {
            return hasRun
                ? "Nenhum conceito na fronteira. Continue os que já estão em andamento."
                : "Monte seu primeiro mapa para começar."
        }
        return "Você está na fronteira de \(frontier.count) conceitos. Continue de onde parou."
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

    // MARK: - Continentes

    /// One continent on "Seus mapas": its member maps, and the scopes it was
    /// charted from that no member covers yet (`useContinents.ts`).
    struct ContinentGroup: Identifiable {
        let continent: Continent
        let maps: [AtlasRun]
        let uncharted: [AtlasAPI.ScopeOffer]
        var id: String { continent.id }
    }

    var continents: [ContinentGroup] {
        let same = { (a: String, b: String) in
            a.trimmingCharacters(in: .whitespaces).lowercased() == b.trimmingCharacters(in: .whitespaces).lowercased()
        }
        return Dictionary(grouping: maps.filter { $0.continent != nil }) { $0.continent!.id }
            .values
            .map { members in
                let continent = members[0].continent!
                return ContinentGroup(
                    continent: continent, maps: members,
                    uncharted: continent.scopes.filter { scope in !members.contains { same($0.subject, scope.label) } }
                )
            }
            .sorted { $0.continent.name.localizedCompare($1.continent.name) == .orderedAscending }
    }

    /// Maps in no continent.
    var looseMaps: [AtlasRun] { maps.filter { $0.continent == nil } }

    /// Build an uncharted scope into its continent: the store clears the open
    /// run, and the fresh onboarding picks the scope up and builds it.
    func chart(_ scope: AtlasAPI.ScopeOffer, in continent: Continent) async {
        store.charting = (scope.label, continent.id)
        await store.newMap()
    }

    func move(_ map: AtlasRun, to continent: Continent?) async {
        await continentWrite(String(localized: "mover esse mapa")) { try await self.store.move(map.id, to: continent) }
    }

    /// What the name alert is naming: a new continent around one map, or an
    /// existing one being renamed.
    enum Naming { case new(AtlasRun), rename(Continent) }
    private(set) var naming: Naming?
    var draftName = ""

    var isNaming: Binding<Bool> {
        Binding(get: { self.naming != nil }, set: { if !$0 { self.naming = nil } })
    }

    func startContinent(with map: AtlasRun) {
        draftName = ""
        naming = .new(map)
    }

    func startRename(_ continent: Continent) {
        draftName = continent.name
        naming = .rename(continent)
    }

    func saveName() async {
        let name = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
        // Held, like `confirmed` below: the alert clears `naming` before this runs.
        let naming = naming
        self.naming = nil
        guard !name.isEmpty, let naming else { return }
        switch naming {
        case .new(let map):
            await continentWrite(String(localized: "criar o continente")) {
                _ = try await self.store.createContinent(name: name, topicIds: [map.id])
            }
        case .rename(let continent):
            await continentWrite(String(localized: "renomear o continente")) {
                try await self.store.renameContinent(continent.id, to: name)
            }
        }
    }

    /// Dissolving asks first. The maps stay; only the grouping goes.
    private(set) var pendingDissolve: Continent?
    private var dissolving: Continent?

    func askToDissolve(_ continent: Continent) {
        pendingDissolve = continent
        dissolving = continent
    }

    var isConfirmingDissolve: Binding<Bool> {
        Binding(get: { self.pendingDissolve != nil }, set: { if !$0 { self.pendingDissolve = nil } })
    }

    var dissolveAsk: String {
        String(localized: "Desfazer “\((pendingDissolve ?? dissolving)?.name ?? "")”?")
    }

    func dissolve() async {
        guard let continent = dissolving else { return }
        dissolving = nil
        pendingDissolve = nil
        await continentWrite(String(localized: "desfazer o continente")) {
            try await self.store.dissolveContinent(continent.id)
        }
    }

    private func continentWrite(_ doing: String, _ op: () async throws -> Void) async {
        message = ""
        do { try await op() } catch { message = ErrorCopy.sentence(for: error, doing: doing) }
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
