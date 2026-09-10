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
    /// The same content as the model wrote it, which is what `run_states.caches`
    /// holds — see `Landed`. Shared with the browser, so it is stored whole and
    /// never re-encoded from the decoded half above.
    public private(set) var raw: [String: JSONValue] = [:]
    /// Bumped on every write to `raw`. `AtlasStore` compares it against what it
    /// last uploaded, so the (large) caches column is only sent when a
    /// generation has actually landed — not on every node drag.
    public private(set) var revision = 0
    /// The passes still being written. Present means "join me", which is the
    /// whole deduplication: every check below happens between two writes on
    /// the main actor, so two callers can never both start one.
    private var inflight: [String: Task<Error?, Never>] = [:]
    /// Keys whose `content` is a usable prefix rather than a finished pass —
    /// a stream that died after three sections, or a slot still being written.
    /// On screen, never in `raw`, and never treated as a cache hit.
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
            do {
                for try await items in await live() {
                    // A redraw of an item still being written: painted, never
                    // filed. `landed` deliberately does not move.
                    if items.partial { self.draft(key, items.value, era); continue }
                    landed = items.value
                    self.write(key, items.value, items.raw, era)
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
                self.write(key, landed.value, landed.raw, era)
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
        raw.removeAll()
        inflight.removeAll()
        incomplete.removeAll()
        // Those still-running tasks now belong to a run nobody is looking at.
        generation += 1
        revision += 1
    }

    /// Put a generation in both halves at once — the only place either is
    /// written, so the decoded value and the JSON behind it can never disagree.
    private func write(_ key: String, _ value: any Sendable, _ raw: JSONValue, _ era: Int) {
        guard era == generation else { return }
        content[key] = value
        self.raw[key] = raw
        incomplete.remove(key)
        revision += 1
    }

    /// A slot still being written. It redraws the screen and nothing else: it
    /// stays out of `raw` so it is never uploaded, and the key stays incomplete
    /// so it is never served to the next caller as a finished pass.
    private func draft(_ key: String, _ value: any Sendable, _ era: Int) {
        guard era == generation else { return }
        content[key] = value
        incomplete.insert(key)
    }

    /// Adopt content generated somewhere else — the run's shared cache, so a
    /// reading pass written in the browser opens on the phone without a
    /// generation. `revision` is deliberately *not* bumped: this is what the
    /// row already holds, and uploading it back would be a round trip that
    /// changes nothing.
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
        self.raw[key] = raw
        if short { incomplete.insert(key) } else { incomplete.remove(key) }
    }

    /// Give up on a pass. The key goes cold either way — `raw` is cleared, so
    /// nothing half-written is uploaded, and the next caller runs the
    /// generation rather than inheriting this one.
    ///
    /// What already landed is a different question from what the cache holds:
    /// those sections have been read, and erasing them takes the learner's
    /// place in the pass away mid-sentence. They stay in `content`, marked
    /// incomplete.
    @discardableResult
    private func failed(_ key: String, _ error: Error, keeping prefix: (any Sendable)?, _ era: Int) -> Error {
        inflight[key] = nil
        guard era == generation else { return error }
        raw[key] = nil
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

    /// Nodes the learner already owns — what Connect may wire into and what a
    /// Crucible problem may interleave. Mirrors `connectPool`.
    ///
    /// Gap sub-nodes are excluded: a gap the learner opened a pass on is
    /// `.learning`, and offering it back as "a concept you already know" is the
    /// bug elaboration exists to avoid. The cap and the ordering matter too —
    /// this list is in the prompt *and* in the cache key, so an unbounded one
    /// grows both without limit, and most-owned first is the order the model
    /// should read it in.
    ///
    /// It is also what keeps the reader and the filler on the same key: nothing
    /// a pass writes (a gap node, this node's own state) can move it.
    func learned(besides node: ConceptNode) -> [ConceptNode] {
        let rank: [NodeState: Int] = [.mastered: 0, .shaky: 1, .learning: 2]
        return graph.nodes
            .filter { $0.gap != true && $0.id != node.id && rank[states[$0.id] ?? .unknown] != nil }
            .sorted { rank[states[$0.id] ?? .unknown, default: 3] < rank[states[$1.id] ?? .unknown, default: 3] }
            .prefix(8)
            .map { $0 }
    }

    /// Where a kind's content lives. The run and the language are in the key
    /// because both change what the model writes; `inputs` carries anything
    /// else the prompt is built from, so content written for one pool is never
    /// served for another.
    func key(_ kind: String, _ node: ConceptNode, _ inputs: String = "") -> String {
        "\(kind)|\(subject)|\(node.id)|\(language)|\(inputs)"
    }

    /// What has landed for each kind — the whole reason a phase can open
    /// without a spinner, and what a screen redraws from while one is landing.
    /// Each reader is the twin of the filler below it: same key, same inputs.
    func chunks(_ node: ConceptNode) -> [ConsumeChunk] { warm.content(key("consume", node)) ?? [] }
    func steps(_ node: ConceptNode) -> [SocraticStep] { warm.content(key("socratic", node)) ?? [] }
    func beats(_ node: ConceptNode) -> [FeynmanBeat] { warm.content(key("feynman", node)) ?? [] }
    /// The rubric on screen is a prefix, not a whole one — a stream that died
    /// short of the floor. `WarmCache.isIncomplete` had no reader anywhere in
    /// the app; this is the phase it matters most to, because a short rubric is
    /// silently a shorter test.
    func beatsIncomplete(_ node: ConceptNode) -> Bool { warm.isIncomplete(key("feynman", node)) }
    func web(_ node: ConceptNode) -> ElaborationContent? {
        warm.content(key("connect", node, learned(besides: node).ids))
    }
    func problems(_ node: ConceptNode) -> CrucibleContent? {
        warm.content(key("crucible", node, crucibleInputs(node)))
    }

    /// The pool *and* which time through this is — the two things that decide
    /// which transfer problem the model writes. One function, because a warm
    /// and the click after it address the same content only if exactly one
    /// decides the inputs.
    private func crucibleInputs(_ node: ConceptNode) -> String {
        let rerun = crucibleRerun[node.id] ?? 0
        return rerun == 0 ? learned(besides: node).ids : "\(learned(besides: node).ids)|r\(rerun)"
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
        return await warm.fill(key("consume", node), atLeast: ConsumeSectionBounds.min,
                               live: { await api.consume(context) })
    }

    @discardableResult
    func socratic(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(key("socratic", node), live: { await api.socratic(context) })
    }

    @discardableResult
    func feynman(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        // The server's own floor (`FEYNMAN_BEAT_BOUNDS.min`). Without it a
        // stream that died after one beat was filed as a complete rubric: the
        // learner taught one sub-point, was told they were done, and the rows
        // the model never wrote could never become gaps.
        return await warm.fill(key("feynman", node), atLeast: FeynmanBeatBounds.min,
                               live: { await api.feynman(context) })
    }

    /// Connect's candidates are the learner's own map, so the pool is part of
    /// the key: a web drawn before they mastered another concept is not the web
    /// they should be shown after it.
    @discardableResult
    func connect(_ node: ConceptNode) async -> Error? {
        let pool = learned(besides: node)
        guard !pool.isEmpty else { return nil }
        var context = context(for: node)
        context["pool"] = .array(pool.map { .object(["id": .string($0.id), "label": .string($0.label)]) })
        let (api, sent) = (api, context)
        return await warm.fill(key("connect", node, pool.ids), once: { try await api.connect(sent) })
    }

    @discardableResult
    func crucible(_ node: ConceptNode) async -> Error? {
        let pool = learned(besides: node)
        let rerun = crucibleRerun[node.id] ?? 0
        var context = context(for: node)
        context["masteredLabels"] = .array(pool.map { .string($0.label) })
        // Omitted when 0, exactly as the server omits it from the cache key —
        // a first pass keys where it always did.
        if rerun > 0 { context["rerun"] = .number(Double(rerun)) }
        let (api, sent) = (api, context)
        return await warm.fill(key("crucible", node, crucibleInputs(node)),
                               once: { try await api.crucible(sent) })
    }

    /// The beats of one lens over one section. Keyed like everything else, with
    /// the section and the lens as the inputs — the same walkthrough reopens
    /// instead of being written a second time.
    func lens(_ node: ConceptNode, _ chunk: ConsumeChunk, _ lens: AltKey) -> [ConsumeModelBeat] {
        warm.content(key("model", node, Self.lensInputs(chunk.id, lens))) ?? []
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
        return await warm.fill(key("model", node, Self.lensInputs(chunk.id, lens)),
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
        let key = "retain|\(subject)|\(language)|\(nodes.ids)"
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
            if item.kind == "model" {
                seedLens(item, byId)
                continue
            }
            guard let node = byId[item.nodeId] else { continue }
            switch item.kind {
            // A short pass came from a stream that died before this floor
            // existed. Adopted as a prefix, so it shows the incomplete notice
            // and its retry instead of reading as a one-section concept.
            case "consume":
                seed(item.kind, node, item.payload, as: [ConsumeChunk].self,
                     shortOf: ConsumeSectionBounds.min)
            case "socratic": seed(item.kind, node, item.payload, as: [SocraticStep].self)
            case "feynman":
                seed(item.kind, node, item.payload, as: [FeynmanBeat].self,
                     shortOf: FeynmanBeatBounds.min)
            case "connect": seed(item.kind, node, item.payload, as: ElaborationContent.self)
            case "crucible": seed(item.kind, node, item.payload, as: CrucibleContent.self)
            default: continue
            }
        }
    }

    /// Content the server holds, under the key this client would have written
    /// it under. Undecodable content is left where it is rather than dropped —
    /// it is still the browser's to render, and this client simply regenerates.
    private func seed<T: Decodable & Sendable>(
        _ kind: String, _ node: ConceptNode, _ raw: JSONValue, as type: T.Type,
        shortOf floor: Int = 0
    ) {
        guard let value = try? raw.decode(T.self) else { return }
        let short = (raw.items?.count ?? Int.max) < floor
        warm.seed(key(kind, node, cacheInputs(kind, node)), value, raw, incomplete: short)
    }

    /// A walkthrough, whose address within its node is `<chunkId>:<lens>` —
    /// the same `variant` the browser writes.
    private func seedLens(_ item: RunStore.ContentItem, _ byId: [String: ConceptNode]) {
        guard let node = byId[item.nodeId], !item.variant.isEmpty,
              let value = try? item.payload.decode([ConsumeModelBeat].self)
        else { return }
        warm.seed(key("model", node, item.variant), value, item.payload)
    }

    /// The pool half of a key. Connect and Crucible are drawn from what the
    /// learner already owns, so their content is keyed on it — while the web
    /// keys on the node alone. Seeding under the *current* pool is what adopts
    /// its answer: the browser would serve that content again too.
    private func cacheInputs(_ kind: String, _ node: ConceptNode) -> String {
        // Crucible carries a rerun index too, but content the server already
        // holds for a node is its *first* pass's problem — so it seeds where a
        // first pass reads, which is the pool alone.
        kind == "connect" || kind == "crucible" ? learned(besides: node).ids : ""
    }
}

private extension Array where Element == ConceptNode {
    /// The pool as one string — part of a key, never shown.
    var ids: String { map(\.id).joined(separator: ",") }
}
