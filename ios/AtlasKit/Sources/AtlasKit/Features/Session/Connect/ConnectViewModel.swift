import Observation
import SwiftUI

/// Screen 17's state: the candidate prior nodes off the learner's own map, the
/// relationship drafts, and which links have been confirmed. Every candidate is
/// a real node they already own, so every link is true rather than trivia.
///
/// On list-like material the phase has a second half — the ordered items and
/// the memory aid the generation drafts for them. It is one screen, not two:
/// the same pass wires the concept in *and* gives the sequence a handle.
@Observable
@MainActor
final class ConnectViewModel {
    private(set) var linked: Set<String> = []
    private(set) var message = ""
    private(set) var writing = true
    /// Nothing owned yet is nothing true to wire into. The phase has no
    /// material — it says so and hands the node on, rather than vanishing.
    private(set) var nothingToWire = false
    private var drafts: [String: String] = [:]
    private var active: String?
    /// The chosen aid (index into `content.mnemonics`), and the learner's
    /// edit of it — accepted, it drafts a card of its own.
    private(set) var mnemonicPick: Int?
    private(set) var mnemonicAccepted = false
    private var mnemonicText = ""

    /// One recogniser for the screen — the link editor is rebuilt on every
    /// candidate, and a recogniser rebuilt with it loses what was being said.
    let dictation = Dictation()

    private let session: SessionViewModel

    init(session: SessionViewModel) {
        self.session = session
    }

    var node: ConceptNode { session.node }
    /// The web lives in the run's warm cache — drawn while the learner was
    /// still teaching the concept back, when Feynman warmed it.
    var content: ElaborationContent? { session.store.web(node) }
    var waitingCopy: String { message.isEmpty ? String(localized: "Procurando o que você já sabe…") : message }

    /// The candidate the prompt is asking about: the one being edited, else the
    /// first still unlinked.
    var candidate: ElaborationLink? {
        guard let content else { return nil }
        return content.cands.first { $0.id == active } ?? content.cands.first { !linked.contains($0.id) }
    }

    /// The confirmed links, in the order the generation laid them out — raw
    /// material for a review card.
    var confirmed: [ElaborationLink] {
        content?.cands.filter { linked.contains($0.id) } ?? []
    }

    /// What the learner has written, and nothing else. The map's own phrasing
    /// is still there — `suggest` puts it in the box on request — but handing
    /// it over unasked turns generation into recognition: they read a plausible
    /// sentence, confirm, and encode almost nothing (`connect.ts`).
    func text(for candidate: ElaborationLink) -> String { drafts[candidate.id] ?? "" }

    /// The back of the card this link drafts: their sentence, or the map's when
    /// they never wrote one.
    func back(for candidate: ElaborationLink) -> String {
        let written = text(for: candidate).trimmed
        return written.isEmpty ? candidate.rel : written
    }

    /// The question that back answers — the front of the card, shown with it so
    /// the drafted card reads as a card rather than as their sentence again.
    func front(for candidate: ElaborationLink) -> String {
        // U+FE0E: a bare U+2194 takes emoji presentation on iOS, so the front
        // read as a blue arrow glyph inside a serif sentence.
        String(localized: "\(content?.centerLabel ?? node.label) \u{2194}\u{FE0E} \(candidate.label): qual é a conexão?")
    }

    func draft(_ candidate: ElaborationLink) -> Binding<String> {
        Binding(get: { self.text(for: candidate) }, set: { self.drafts[candidate.id] = $0; self.park() })
    }

    /// "Ver a sugestão do mapa" — offered, never imposed, and gone once there
    /// is anything of theirs to overwrite.
    func suggest(_ candidate: ElaborationLink) { drafts[candidate.id] = candidate.rel; park() }
    func canSuggest(_ candidate: ElaborationLink) -> Bool { text(for: candidate).trimmed.isEmpty }

    func canConfirm(_ candidate: ElaborationLink) -> Bool { !text(for: candidate).trimmed.isEmpty }

    func confirm(_ candidate: ElaborationLink) {
        linked.insert(candidate.id)
        active = content?.cands.first { !linked.contains($0.id) }?.id
        park()
    }

    /// Pick any node on the web, including one already linked — the order the
    /// generation happened to emit is not the order the learner has to work in.
    func select(_ candidate: ElaborationLink) { active = candidate.id; park() }

    // MARK: - The mnemonic half (list-like content only)

    /// The aids on offer. Empty for conceptual material, which is the whole
    /// point of the detector: a mnemonic there is noise.
    var mnemonics: [ElaborationContent.Mnemonic] {
        guard let content, content.isListLike else { return [] }
        return content.mnemonics ?? []
    }

    /// The ordered items the aid organizes — what the learner is actually
    /// being handed a handle for.
    ///
    /// `items` is an ordered array and the row draws its own ordinal, but the
    /// model writes "1. …" into the text about half the time — so the list
    /// rendered "1  1. Condensação…". Strip the one it wrote rather than drop
    /// the one the row draws: a step arriving unnumbered still gets a number.
    var items: [String] {
        guard content?.isListLike == true else { return [] }
        return (content?.items ?? []).map(Self.unnumbered)
    }

    private static let ordinal = /^\d{1,2}\s*[.)\-–:]\s+/

    private static func unnumbered(_ item: String) -> String {
        let trimmed = item.trimmed
        guard let match = trimmed.firstMatch(of: ordinal) else { return trimmed }
        return String(trimmed[match.range.upperBound...])
    }

    /// The tool's name in the learner's language. The model writes it in
    /// English — the prompt fixes the three it may answer — and what the
    /// learner reads is not the model's to choose. Anything else is shown as
    /// written, which is better than a blank label over a real aid.
    static func toolName(_ kind: String) -> LocalizedStringKey? {
        switch kind.lowercased() {
        case "acronym", "acrônimo": "Acrônimo"
        case "method of loci", "memory palace", "palácio da memória": "Palácio da memória"
        case "vivid image", "imagem vívida": "Imagem vívida"
        default: nil
        }
    }

    var mnemonic: Binding<String> {
        Binding(get: { self.mnemonicText }, set: { self.mnemonicText = $0; self.park() })
    }

    /// Pick an aid: its body goes in the box, editable, and un-accepts whatever
    /// was accepted before. Mirrors `pickMnemonic`.
    func pick(_ index: Int) {
        guard let option = mnemonics.indices.contains(index) ? mnemonics[index] : nil else { return }
        mnemonicPick = index
        mnemonicText = option.body
        mnemonicAccepted = false
        park()
    }

    func acceptMnemonic() {
        guard mnemonicPick != nil, !mnemonicText.trimmed.isEmpty else { return }
        mnemonicAccepted = true
        park()
    }

    /// The front of the card an accepted aid drafts.
    var mnemonicFront: String {
        String(localized: "\(content?.centerLabel ?? node.label) · qual é a ordem dos passos?")
    }

    // MARK: - The gate

    /// How many links the gate is asking for — two, unless the web could never
    /// offer two. The number is on screen because a gate you cannot count down
    /// is a gate you cannot plan around.
    var required: Int { min(2, max(1, content?.cands.count ?? 1)) }

    /// Two real connections is the design's gate — but a web that only ever
    /// offered one candidate cannot produce two, and a gate nobody can pass is
    /// a dead end. Mirrors `connectReady`.
    var ready: Bool { linked.count >= required }

    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }

    // MARK: - Leaving

    /// Understood and wired, but nothing has proven it transfers yet — that is
    /// exactly Shaky, and the write lives on the session.
    ///
    /// Every confirmed link also becomes a real review card. That was the whole
    /// promised product of the phase — the screen counted them out loud — and
    /// nothing was ever written: the learner's own sentence died with the view.
    func advance() {
        draftCards()
        // The cards are drafted and the node is about to move: the parked copy
        // has nothing left to come back to. Mirrors `advanceFromConnect`.
        session.store.clearConnect(node.id)
        session.finishConnect()
        session.advance()
    }

    /// One card per confirmed link (plus the accepted aid), keyed by the link's
    /// own identity so redoing the phase rewrites in place instead of stacking
    /// a second copy into the queue. Mirrors `connectCards` + `advanceFromConnect`.
    private func draftCards() {
        guard let content else { return }
        var drafted: [(id: String, type: ReviewCardType, front: String, back: String)] =
            confirmed.map {
                ("\(content.centerId)-connect-\($0.id)", .why, front(for: $0), back(for: $0))
            }
        // A mnemonic is order-recall, not a "why" — grading it as one would
        // misreport what the learner actually proved.
        if mnemonicAccepted, !mnemonicText.trimmed.isEmpty {
            drafted.append((
                "\(content.centerId)-connect-mnemonic", .recall, mnemonicFront, mnemonicText.trimmed
            ))
        }
        for card in drafted {
            // Keep the scheduler state of a card that already exists: redoing
            // Connect must not reset a link the learner has been reviewing. The
            // state itself is opaque here — it is the server's, and this only
            // carries it forward with the rewritten text.
            if let index = session.store.cards.firstIndex(where: { $0.id == card.id }) {
                session.store.cards[index].front = card.front
                session.store.cards[index].back = card.back
            } else {
                session.store.cards.append(StoredCard(
                    id: card.id, nodeId: node.id, type: card.type, source: "Connect",
                    front: card.front, back: card.back
                ))
            }
        }
    }

    /// Park the pass as it stands. Called on every change the learner makes —
    /// a keystroke included — because leaving the screen used to discard every
    /// sentence they had written. The store's own debounce makes that one
    /// request rather than one per letter.
    private func park() {
        session.store.note(connect: ConnectSnapshot(
            nodeId: node.id, active: active, drafts: drafts,
            linked: Dictionary(uniqueKeysWithValues: linked.map { ($0, true) }),
            mnemonicPick: mnemonicPick, mnemonicDraft: mnemonicText,
            mnemonicAccepted: mnemonicAccepted
        ))
    }

    /// Leave without an elaboration behind you. The node is *not* marked
    /// "understood and connected" — nothing was connected, and `advance` is
    /// what claims it was. The web's skip does the same: it enters the Crucible
    /// directly, past `advanceFromConnect`.
    func skip() { session.advance() }

    func load() async {
        // Nothing owned yet is nothing true to wire into: the phase has no
        // material, so it says so and offers the Crucible rather than asking
        // the learner to link concepts they have never met. The store answers
        // the same way — an empty pool is no generation at all.
        guard !session.learnedElsewhere.isEmpty else {
            nothingToWire = true
            writing = false
            return
        }
        // Resume the pass if one was left open — the links already written are
        // the learner's words, not something to re-earn.
        if let saved = session.store.savedConnect(node.id) {
            drafts = saved.drafts
            linked = Set(saved.linked.filter(\.value).keys)
            active = saved.active
            mnemonicPick = saved.mnemonicPick
            mnemonicText = saved.mnemonicDraft
            mnemonicAccepted = saved.mnemonicAccepted
        }
        writing = true
        message = ""
        if let error = await session.store.connect(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar sua teia"))
        }
        writing = false
    }

    func retry() async { await load() }
}
