import Observation
import SwiftUI

/// The client half of "no screen should wait on a model" — the port of
/// `lib/warm.ts`. Content for what the learner is about to reach is generated
/// while they work on what is on screen, so opening the next phase is a state
/// change rather than a round trip.
///
/// Two rules make it safe, and they are both here rather than at the call
/// sites:
///
/// - **One generation per key.** A warm and the click that beats it to the
///   punch share a single task: clicking through early costs the remainder of
///   a request already running, never a second generation and never a second
///   charge.
/// - **Nothing incomplete is *kept*.** A pass that fails leaves no cache entry,
///   so the click that needed it retries and surfaces the error itself instead
///   of being handed a stale one. What already landed does stay readable —
///   those are the sections the learner is looking at, and taking them back
///   mid-sentence is not a failure they caused. `incomplete` is what keeps the
///   two apart: the prefix is on screen, the key is still cold.
///
/// `content` is observed, not returned: a screen reads the key it cares about
/// and redraws as it fills, whether the generation was started by that screen
/// a moment ago or by a warm five minutes before it.
@Observable
@MainActor
public final class WarmCache {
    /// Everything generated for the open run, by key. A key present with no
    /// task behind it is a finished pass.
    public private(set) var content: [String: any Sendable] = [:]
    /// Called with the address and the model's own JSON the moment a whole
    /// pass lands, so a generation reaches the device mirror as it arrives
    /// rather than on the next hydrate (`docs/CONTENT-STORAGE.md`, rule 3).
    /// Never called for a draft: a prefix is not content.
    ///
    /// This replaced a second dictionary of every payload, held for the whole
    /// run so it could be re-uploaded into `run_states.caches`. That column is
    /// gone, nothing was uploading, and the copy was pure memory.
    public var onLanded: (@MainActor (String, JSONValue) -> Void)?
    /// The passes still being written. Present means "join me", which is the
    /// whole deduplication: every check below happens between two writes on
    /// the main actor, so two callers can never both start one.
    private var inflight: [String: Task<Error?, Never>] = [:]
    /// Keys whose `content` is a usable prefix rather than a finished pass —
    /// a stream that died after three sections, or a slot still being written.
    /// On screen, never in the mirror, and never treated as a cache hit.
    private var incomplete: Set<String> = []
    /// Which run the cache is holding. `clear()` bumps it, and every write
    /// checks it: a generation started for the previous map is deliberately
    /// left running, so it must not be able to file its answer into this one.
    private var generation = 0

    public init() {}

    /// What landed at `key`, if anything has.
    public func content<T: Sendable>(_ key: String) -> T? { content[key] as? T }

    /// True while `key` holds a prefix rather than a whole pass — what a screen
    /// draws its "this reading is incomplete" row from.
    public func isIncomplete(_ key: String) -> Bool { incomplete.contains(key) }

    /// Run — or join — the progressive generation at `key`, writing each landed
    /// list into `content` as it arrives so a screen paints on its first item
    /// rather than its last. Returns the failure to whoever waited, or nil.
    ///
    /// Every check above the `inflight` write happens without a suspension in
    /// between, which is why two callers on the same key can never both start.
    /// `atLeast` is the kind's own floor — how many items make a *whole*
    /// answer rather than a prefix of one. The server states it in its
    /// validator (`arr(root.chunks, "chunks", min, max)`); on the device this
    /// is where it lives, because this is the one place that decides whether a
    /// pass is kept as finished or kept as a prefix to be retried.
    @discardableResult
    public func fill<T: Sendable>(
        _ key: String,
        atLeast minimum: Int = 1,
        live: @escaping @Sendable () async -> AsyncThrowingStream<Landed<[T]>, Error>
    ) async -> Error? {
        if let running = inflight[key] { return await running.value }
        // A prefix is not a hit: it is what the screen is reading while the
        // caller runs the generation again.
        if content[key] != nil, !incomplete.contains(key) { return nil }
        let era = generation
        // Strong `self` on purpose: the cache is what the app reads, and a warm
        // that outlives the screen that started it is the whole point. The
        // cycle it makes with `inflight` breaks when the task lands.
        let task = Task<Error?, Never> {
            var landed: [T] = []
            // The model's own JSON for what has landed so far. Held rather
            // than written through: the mirror takes whole passes only, and
            // whether this one is whole is not known until the stream ends.
            var raw: JSONValue = .null
            do {
                for try await items in await live() {
                    // A redraw of an item still being written: painted, never
                    // filed. `landed` deliberately does not move.
                    if items.partial { self.draft(key, items.value, era); continue }
                    landed = items.value
                    raw = items.raw
                    self.write(key, items.value, era)
                }
                // A pass that ended short is a failure that forgot to throw.
                // Nothing at all hands every later click an empty screen; one
                // section of a five-section reading is worse, because it looks
                // like a finished pass and gets cached, uploaded and re-served
                // as one. Either way what landed is kept and marked incomplete
                // by `failed` below — the learner keeps their place, and the
                // key stays cold so the retry actually regenerates.
                guard landed.count >= minimum else {
                    throw AtlasError(
                        code: "upstream",
                        message: landed.isEmpty
                            ? "\(key) came back empty"
                            : "\(key) stopped after \(landed.count) of at least \(minimum)"
                    )
                }
            } catch {
                return self.failed(key, error, keeping: landed.isEmpty ? nil : landed, era)
            }
            // Whole, and only now: a pass that ended short threw above, so
            // nothing short of the kind's floor ever reaches the mirror.
            self.commit(key, raw, era)
            self.inflight[key] = nil
            return nil
        }
        inflight[key] = task
        return await task.value
    }

    /// The same, for the kinds the server answers whole — one object, so there
    /// is nothing to paint progressively.
    @discardableResult
    public func fill<T: Sendable>(
        _ key: String,
        once: @escaping @Sendable () async throws -> Landed<T>
    ) async -> Error? {
        if let running = inflight[key] { return await running.value }
        if content[key] != nil, !incomplete.contains(key) { return nil }
        let era = generation
        let task = Task<Error?, Never> {
            do {
                let landed = try await once()
                self.write(key, landed.value, era)
                self.commit(key, landed.raw, era)
                self.inflight[key] = nil
                return nil
            } catch {
                // One object: there is no prefix of it to keep.
                return self.failed(key, error, keeping: nil, era)
            }
        }
        inflight[key] = task
        return await task.value
    }

    /// A new map invalidates every key. Tasks already running are left alone —
    /// cancelling a generation that is nearly back wastes what was paid for it,
    /// and it writes into a dictionary nothing reads any more.
    public func clear() {
        content.removeAll()
        inflight.removeAll()
        incomplete.removeAll()
        // Those still-running tasks now belong to a run nobody is looking at.
        generation += 1
    }

    /// Put what has landed on screen. Called per frame while a pass streams,
    /// so a reader paints on the first section rather than the last.
    private func write(_ key: String, _ value: any Sendable, _ era: Int) {
        guard era == generation else { return }
        content[key] = value
        incomplete.remove(key)
    }

    /// Hand a *whole* pass to the mirror — once, at the end.
    ///
    /// Not per frame. A stream that died after two of five sections had
    /// already painted two frames, and writing each one through put a
    /// truncated pass on disk that the next launch would seed as finished.
    /// Whole passes only: that is the same rule `failed` enforces in memory.
    private func commit(_ key: String, _ raw: JSONValue, _ era: Int) {
        guard era == generation else { return }
        if case .null = raw { return }
        onLanded?(key, raw)
    }

    /// A slot still being written. It redraws the screen and nothing else: it
    /// never reaches the mirror, and the key stays incomplete so it is never
    /// served to the next caller as a finished pass.
    private func draft(_ key: String, _ value: any Sendable, _ era: Int) {
        guard era == generation else { return }
        content[key] = value
        incomplete.insert(key)
    }

    /// Adopt content generated somewhere else — the topic's own rows, so a
    /// reading pass written in the browser opens on the phone without a
    /// generation. `onLanded` is deliberately *not* called: this content came
    /// *from* the server (and is already in the mirror), so sending it back
    /// there would be a write that changes nothing.
    /// A whole pass from the shared row beats a prefix this device is holding,
    /// so an incomplete key is seeded over rather than skipped.
    /// `incomplete` is for content the row holds that is short of its kind's
    /// floor — a pass the other client (or an older build of this one) uploaded
    /// after its stream died. It is still the learner's place in the reading,
    /// so it is shown; it is not a finished pass, so it is not served as a
    /// cache hit and the screen offers the retry.
    func seed(_ key: String, _ value: any Sendable, _ raw: JSONValue, incomplete short: Bool = false) {
        guard inflight[key] == nil, content[key] == nil || incomplete.contains(key) else { return }
        content[key] = value
        if short { incomplete.insert(key) } else { incomplete.remove(key) }
    }

    /// Give up on a pass. The key goes cold either way, so the next caller
    /// runs the generation rather than inheriting this one. Nothing
    /// half-written ever reached the mirror: only `write` files a pass.
    ///
    /// What already landed is a different question from what the cache holds:
    /// those sections have been read, and erasing them takes the learner's
    /// place in the pass away mid-sentence. They stay in `content`, marked
    /// incomplete.
    @discardableResult
    private func failed(_ key: String, _ error: Error, keeping prefix: (any Sendable)?, _ era: Int) -> Error {
        inflight[key] = nil
        guard era == generation else { return error }
        content[key] = prefix
        if prefix == nil { incomplete.remove(key) } else { incomplete.insert(key) }
        return error
    }
}

// MARK: - What is worth having ready

/// The builders. Every kind is asked for in exactly one place, because a warm
/// and the click after it only share a task if they agree on the key *and* on
/// the inputs behind it — compute a pool or a boundary twice and you pay for
/// the generation twice.
@MainActor
public extension AtlasStore {
    /// The context every kind on a node shares. `priorLabels`/`laterLabels` are
    /// the boundary — what earlier passes already taught and what later ones
    /// own — so a pass stays inside its own concept instead of re-teaching a
    /// prerequisite or spoiling the next node.
    func context(for node: ConceptNode) -> [String: JSONValue] {
        let prereqs = graph.prerequisites(of: node.id).map(\.label)
        // Not the direct neighbours: the boundary is the *transitive* ancestors
        // against everything else on the map, which is what the server's prompt
        // has always meant by these two — and the pass this writes lands in the
        // shared `caches` column, so a narrow boundary here is what the browser
        // then serves for that node too.
        let boundary = graph.boundary(of: node.id)
        return [
            "topic": .string(subject),
            "nodeId": .string(node.id),
            "nodeLabel": .string(node.label),
            "interests": .string(interests),
            "language": .string(AtlasAPI.language),
            "prereqLabels": .array(prereqs.map { .string($0) }),
            "priorLabels": .array(boundary.prior.map { .string($0) }),
            "laterLabels": .array(boundary.later.map { .string($0) }),
        ]
    }

    /// Connect's pool — the nodes the learner already owns, which a web may be
    /// wired into. Mirrors `connectPool` on the web, filter for filter and
    /// sort for sort, because it is in the prompt and therefore in the
    /// server's `content_cache` key: derive it differently on the two clients
    /// and each pays for the other's web.
    ///
    /// Gap sub-nodes are excluded: a gap the learner opened a pass on is
    /// `.learning`, and offering it back as "a concept you already know" is the
    /// bug elaboration exists to avoid. The cap and the ordering matter for the
    /// same reason — an unbounded list grows the prompt without limit, and
    /// most-owned first is the order the model should read it in.
    ///
    /// It is *not* part of the address any more. See `address`.
    func learned(besides node: ConceptNode) -> [ConceptNode] {
        let rank: [NodeState: Int] = [.mastered: 0, .shaky: 1, .learning: 2]
        return graph.nodes
            .filter { $0.gap != true && $0.id != node.id && rank[states[$0.id] ?? .unknown] != nil }
            .sorted { rank[states[$0.id] ?? .unknown, default: 3] < rank[states[$1.id] ?? .unknown, default: 3] }
            .prefix(8)
            .map { $0 }
    }

    /// The labels a transfer problem may interleave — what the learner has
    /// actually mastered, in map order, derived exactly as `learnedLabels`
    /// derives it on the web (the node itself included when it is mastered,
    /// which a redo is).
    ///
    /// Not `learned(besides:)`: that is Connect's pool, which also holds
    /// `learning` and `shaky` and is capped at eight. The two clients have to
    /// hash the same prompt inputs or they pay for the same problem twice —
    /// this list is in the Crucible's `content_cache` key.
    var masteredLabels: [String] {
        graph.nodes.filter { $0.gap != true && states[$0.id] == .mastered }.map(\.label)
    }

    /// Where a kind's content lives: the address of its `node_content` row,
    /// spelled exactly as the web spells it — see `docs/CONTENT-STORAGE.md`.
    ///
    /// The run and the language are deliberately absent. The cache holds one
    /// run, in one language, and is emptied when either moves, so putting them
    /// in every key bought nothing. The pool is absent for the same reason it
    /// is absent from the web's: it shapes the *prompt*, and therefore the
    /// server's `content_cache` key, but it is not what this content is
    /// called. It used to be in here, and mastering any concept mid-run
    /// re-addressed Connect and Crucible — regenerating what the topic
    /// already owned and what the browser would have re-served.
    func address(_ kind: String, _ nodeId: String, variant: String = "") -> String {
        "\(nodeId)|\(kind)|\(variant)"
    }

    func address(_ kind: String, _ node: ConceptNode, variant: String = "") -> String {
        address(kind, node.id, variant: variant)
    }

    /// What has landed for each kind — the whole reason a phase can open
    /// without a spinner, and what a screen redraws from while one is landing.
    /// Each reader is the twin of the filler below it: same key, same inputs.
    func chunks(_ node: ConceptNode) -> [ConsumeChunk] { warm.content(address("consume", node)) ?? [] }
    func steps(_ node: ConceptNode) -> [SocraticStep] { warm.content(address("socratic", node)) ?? [] }
    func beats(_ node: ConceptNode) -> [FeynmanBeat] { warm.content(address("feynman", node)) ?? [] }
    /// The rubric on screen is a prefix, not a whole one — a stream that died
    /// short of the floor. `WarmCache.isIncomplete` had no reader anywhere in
    /// the app; this is the phase it matters most to, because a short rubric is
    /// silently a shorter test.
    func beatsIncomplete(_ node: ConceptNode) -> Bool { warm.isIncomplete(address("feynman", node)) }
    func web(_ node: ConceptNode) -> ElaborationContent? {
        warm.content(address("connect", node))
    }
    func problems(_ node: ConceptNode) -> CrucibleContent? {
        warm.content(address("crucible", node, variant: crucibleVariant(node)))
    }

    /// Which time through this concept's transfer test this is, as the row's
    /// own address. The first pass is the node's plain Crucible; a redo is
    /// content in its own right — the learner should be able to reach the
    /// problem they solved — so it gets a variant instead of upserting over it.
    func crucibleVariant(_ node: ConceptNode) -> String {
        let rerun = crucibleRerun[node.id] ?? 0
        return rerun == 0 ? "" : "r\(rerun)"
    }

    /// Opening the Crucible again on a concept the learner has already carried
    /// through it asks for a *new* problem. Re-serving the one they solved
    /// measures recall, which is the one thing this phase exists not to
    /// measure. Called once per redo entry, before the first warm.
    func bumpCrucibleRerun(_ nodeId: String) {
        crucibleRerun[nodeId] = (crucibleRerun[nodeId] ?? 0) + 1
    }

    @discardableResult
    func consume(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(address("consume", node), atLeast: ConsumeSectionBounds.min,
                               live: { await api.consume(context) })
    }

    @discardableResult
    func socratic(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(address("socratic", node), live: { await api.socratic(context) })
    }

    @discardableResult
    func feynman(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        // The server's own floor (`FEYNMAN_BEAT_BOUNDS.min`). Without it a
        // stream that died after one beat was filed as a complete rubric: the
        // learner taught one sub-point, was told they were done, and the rows
        // the model never wrote could never become gaps.
        return await warm.fill(address("feynman", node), atLeast: FeynmanBeatBounds.min,
                               live: { await api.feynman(context) })
    }

    /// Connect's candidates are the learner's own map. The pool shapes the
    /// prompt — and so the server's cache key — but not the address: this
    /// node's web is this node's web, exactly as the browser stores it.
    @discardableResult
    func connect(_ node: ConceptNode) async -> Error? {
        let pool = learned(besides: node)
        guard !pool.isEmpty else { return nil }
        var context = context(for: node)
        context["pool"] = .array(pool.map { .object(["id": .string($0.id), "label": .string($0.label)]) })
        let (api, sent) = (api, context)
        return await warm.fill(address("connect", node), once: { try await api.connect(sent) })
    }

    @discardableResult
    func crucible(_ node: ConceptNode) async -> Error? {
        let rerun = crucibleRerun[node.id] ?? 0
        let variant = crucibleVariant(node)
        var context = context(for: node)
        context["masteredLabels"] = .array(masteredLabels.map { .string($0) })
        // Omitted when 0, exactly as the server omits it from the cache key —
        // a first pass keys where it always did.
        if rerun > 0 { context["rerun"] = .number(Double(rerun)) }
        // The address the server files the problem under. Without it a redo
        // upserts over the row holding the problem the learner already solved.
        if !variant.isEmpty { context["variant"] = .string(variant) }
        let (api, sent) = (api, context)
        return await warm.fill(address("crucible", node, variant: variant),
                               once: { try await api.crucible(sent) })
    }

    /// The beats of one lens over one section. Keyed like everything else, with
    /// the section and the lens as the inputs — the same walkthrough reopens
    /// instead of being written a second time.
    func lens(_ node: ConceptNode, _ chunk: ConsumeChunk, _ lens: AltKey) -> [ConsumeModelBeat] {
        warm.content(address("model", node, variant: Self.lensInputs(chunk.id, lens))) ?? []
    }

    @discardableResult
    func model(
        _ node: ConceptNode, _ chunk: ConsumeChunk, _ lens: AltKey, context: [String: JSONValue]
    ) async -> Error? {
        var context = context
        // The address the server files the walkthrough under, and the one
        // `seedWarm` reads it back from — the same string the browser sends.
        // Without it every lens over every section would upsert the same
        // `node_content` row.
        context["variant"] = .string(Self.lensInputs(chunk.id, lens))
        let (api, sent) = (api, context)
        return await warm.fill(address("model", node, variant: Self.lensInputs(chunk.id, lens)),
                               live: { await api.model(sent) })
    }

    /// Have `kind` ready for `node` before it is asked for. Fire and forget: a
    /// warm nobody is watching that fails is retried by the click that needed it.
    func warmUp(_ kind: String, for node: ConceptNode) {
        Task {
            // A warm carries the same credential a click would. It is the first
            // thing that fires on a launch that painted from the mirror, which
            // is exactly when the stored access token can still be the expired
            // one — and a speculative 401 leaves the key cold and the learner
            // waiting for the generation at the tap.
            _ = await bearer()
            switch kind {
            case "consume": await consume(node)
            case "socratic": await socratic(node)
            case "feynman": await feynman(node)
            case "connect": await connect(node)
            case "crucible": await crucible(node)
            default: break
            }
        }
    }

    // MARK: - Retain

    /// The day's cards for the nodes that have none. A card factory, not a
    /// queue: what it drafts is scheduled locally from then on, so it is asked
    /// once per set of uncovered nodes — which is what the key says.
    @discardableResult
    func draftCards(for nodes: [ConceptNode]) async -> Error? {
        guard !nodes.isEmpty else { return nil }
        // A request-dedupe key, deliberately *not* a content address: what
        // this drafts becomes `cards` rows, not a `node_content` payload, and
        // it has to re-run whenever the uncovered set moves. `WarmCache` is
        // both the content store and the one-request-per-key registry; this
        // uses only the second. The `draft:` prefix is what keeps it out of
        // the address space (see `AtlasStore.mirror`).
        let key = "draft:retain|\(subject)|\(language)|\(nodes.ids)"
        let (api, topic, budget, interests) = (api, subject, dailyTarget, interests)
        let items = nodes.map { (id: $0.id, label: $0.label, state: states[$0.id] ?? .learning) }
        let error = await warm.fill(key, once: {
            try await api.retain(topic: topic, budgetMin: budget, nodes: items, interests: interests)
        })
        if let error { return error }
        let drafted: [ReviewCard] = warm.content(key) ?? []
        // The warm drafts into the run itself, so the cards are already written
        // when the tab is opened — and the guard is what keeps the click that
        // follows the warm from filing every card a second time.
        //
        // No scheduler state travels: these are new cards, and where they go
        // next is decided by the one scheduler, on the server, from the first
        // grade onwards.
        //
        // The id the server puts on a drafted card is request-scoped — `r1…rN`,
        // reassigned on every draft — so filing them verbatim meant the second
        // node's cards collided with the first's and were dropped by the guard
        // below, forever. The browser mints its own for exactly this reason
        // (`useSpiral.ts`), and this is the same shape so one deck reads the
        // same on both clients.
        let stamp = Int(Date.now.timeIntervalSince1970 * 1000)
        for (index, card) in drafted.enumerated() {
            let id = "\(card.node)-retain-\(stamp)-\(index)"
            guard !cards.contains(where: { $0.id == id }) else { continue }
            cards.append(StoredCard(
                id: id, nodeId: card.node, type: card.type, source: card.source,
                cloze: card.cloze, answer: card.answer, front: card.front,
                back: card.back, reExplain: card.reExplain
            ))
        }
        // The deck is read back from the server, and the ordinary save is two
        // seconds behind — so without this the very first Review of a run asks
        // for a queue built from cards that have not landed yet, and gets none.
        await saveNow()
        return nil
    }

    /// Draft the Review queue ahead of the tap, the same way a phase is warmed.
    func warmRetain() {
        Task {
            _ = await bearer()
            await draftCards(for: uncovered)
        }
    }
}

// MARK: - The topic's stored content

/// Generated content belongs to the topic, one row per payload, and the server
/// writes it the moment it generates it.
///
/// This used to be an upload: the browser's `run_states.caches` column, which
/// this client downloaded whole on open and re-uploaded *merged* after every
/// generation — merged because rebuilding the object from its own cache would
/// have deleted the buckets it never fills. None of that exists any more. What
/// arrives here is a list of `(node, kind, variant, payload)` rows, and nothing
/// goes back.
@MainActor
public extension AtlasStore {
    /// The lens half of a warm key, and the tail of the server's own
    /// `variant` for a walkthrough — one section, one lens.
    static func lensInputs(_ chunkId: String, _ lens: AltKey) -> String {
        "\(chunkId):\(lens.rawValue)"
    }

    /// Adopt the topic's stored content. Called on open, once the subject, the
    /// graph and the language a key is built from are all in place.
    func seedWarm(_ items: [RunStore.ContentItem]) {
        let byId = graph.byId
        for item in items {
            // A payload for a node this map does not have — a re-planned gap
            // this client has not seen yet — is dropped rather than filed
            // under an address nothing will ask for.
            guard byId[item.nodeId] != nil else { continue }
            // The row's own address, not one re-derived from state that has
            // moved since it was written. That derivation is what used to make
            // a newly mastered concept re-address Connect and Crucible, and so
            // regenerate content this topic already owned.
            let key = address(item.kind, item.nodeId, variant: item.variant)
            switch item.kind {
            // A short pass came from a stream that died before this floor
            // existed. Adopted as a prefix, so it shows the incomplete notice
            // and its retry instead of reading as a one-section concept.
            case "consume":
                seed(key, item.payload, as: [ConsumeChunk].self,
                     shortOf: ConsumeSectionBounds.min)
            case "socratic": seed(key, item.payload, as: [SocraticStep].self)
            case "feynman":
                seed(key, item.payload, as: [FeynmanBeat].self,
                     shortOf: FeynmanBeatBounds.min)
            case "connect": seed(key, item.payload, as: ElaborationContent.self)
            case "crucible": seed(key, item.payload, as: CrucibleContent.self)
            // A walkthrough's address within its node is `<chunkId>:<lens>`;
            // without one there is no way to tell two lenses apart.
            case "model":
                guard !item.variant.isEmpty else { continue }
                seed(key, item.payload, as: [ConsumeModelBeat].self)
            default: continue
            }
        }
    }

    /// Content the server holds, at the address it holds it under. Every
    /// payload arrives in the shape its screen renders — the server takes the
    /// generator's envelope off (`renderShape`) — so this decodes what it
    /// draws and nothing here knows about `chunks` or `steps`.
    ///
    /// Undecodable content is left where it is rather than dropped: it is
    /// still the browser's to render, and this client simply regenerates.
    private func seed<T: Decodable & Sendable>(
        _ key: String, _ raw: JSONValue, as type: T.Type, shortOf floor: Int = 0
    ) {
        guard let value = try? raw.decode(T.self) else { return }
        warm.seed(key, value, raw, incomplete: (raw.items?.count ?? Int.max) < floor)
    }
}

private extension Array where Element == ConceptNode {
    /// The pool as one string — part of a key, never shown.
    var ids: String { map(\.id).joined(separator: ",") }
}
