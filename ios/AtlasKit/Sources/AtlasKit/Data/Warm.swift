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
/// - **Nothing incomplete is kept.** A pass that fails leaves no trace, so the
///   click that needed it retries and surfaces the error itself instead of
///   being handed a stale one.
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

    public init() {}

    /// What landed at `key`, if anything has.
    public func content<T: Sendable>(_ key: String) -> T? { content[key] as? T }

    /// Run — or join — the progressive generation at `key`, writing each landed
    /// list into `content` as it arrives so a screen paints on its first item
    /// rather than its last. Returns the failure to whoever waited, or nil.
    ///
    /// Every check above the `inflight` write happens without a suspension in
    /// between, which is why two callers on the same key can never both start.
    @discardableResult
    public func fill<T: Sendable>(
        _ key: String,
        live: @escaping @Sendable () async -> AsyncThrowingStream<Landed<[T]>, Error>
    ) async -> Error? {
        if let running = inflight[key] { return await running.value }
        if content[key] != nil { return nil }
        // Strong `self` on purpose: the cache is what the app reads, and a warm
        // that outlives the screen that started it is the whole point. The
        // cycle it makes with `inflight` breaks when the task lands.
        let task = Task<Error?, Never> {
            var landed: [T] = []
            do {
                for try await items in await live() {
                    landed = items.value
                    self.write(key, items.value, items.raw)
                }
                // A pass that ended with nothing is a failure that forgot to
                // throw; keeping it hands every later click an empty screen.
                guard !landed.isEmpty else {
                    throw AtlasError(code: "upstream", message: "\(key) came back empty")
                }
            } catch {
                return self.failed(key, error)
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
        if content[key] != nil { return nil }
        let task = Task<Error?, Never> {
            do {
                let landed = try await once()
                self.write(key, landed.value, landed.raw)
                self.inflight[key] = nil
                return nil
            } catch {
                return self.failed(key, error)
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
        revision += 1
    }

    /// Put a generation in both halves at once — the only place either is
    /// written, so the decoded value and the JSON behind it can never disagree.
    private func write(_ key: String, _ value: any Sendable, _ raw: JSONValue) {
        content[key] = value
        self.raw[key] = raw
        revision += 1
    }

    /// Adopt content generated somewhere else — the run's shared cache, so a
    /// reading pass written in the browser opens on the phone without a
    /// generation. `revision` is deliberately *not* bumped: this is what the
    /// row already holds, and uploading it back would be a round trip that
    /// changes nothing.
    func seed(_ key: String, _ value: any Sendable, _ raw: JSONValue) {
        guard content[key] == nil, inflight[key] == nil else { return }
        content[key] = value
        self.raw[key] = raw
    }

    /// Forget everything about a failed pass, half-written content included, so
    /// the next caller retries it instead of inheriting it.
    @discardableResult
    private func failed(_ key: String, _ error: Error) -> Error {
        content[key] = nil
        raw[key] = nil
        inflight[key] = nil
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
        // One index for both walks: each of these used to scan every node per
        // edge, and every phase asks for a context.
        let byId = graph.byId
        let prereqs = graph.prerequisites(of: node.id).map(\.label)
        let later = graph.edges
            .filter { $0.from == node.id && !$0.dashed }
            .compactMap { byId[$0.to]?.label }
        return [
            "topic": .string(subject),
            "nodeId": .string(node.id),
            "nodeLabel": .string(node.label),
            "interests": .string(interests),
            "language": .string(AtlasAPI.language),
            "prereqLabels": .array(prereqs.map { .string($0) }),
            "priorLabels": .array(prereqs.map { .string($0) }),
            "laterLabels": .array(later.map { .string($0) }),
        ]
    }

    /// Nodes the learner already owns — what Connect may wire into and what a
    /// Crucible problem may interleave. Mirrors `CONNECT_POOL_STATES`.
    func learned(besides node: ConceptNode) -> [ConceptNode] {
        graph.nodes.filter { $0.id != node.id && (states[$0.id] ?? .unknown).isLearned }
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
    func web(_ node: ConceptNode) -> ElaborationContent? {
        warm.content(key("connect", node, learned(besides: node).ids))
    }
    func problems(_ node: ConceptNode) -> CrucibleContent? {
        warm.content(key("crucible", node, learned(besides: node).ids))
    }

    @discardableResult
    func consume(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(key("consume", node), live: { await api.consume(context) })
    }

    @discardableResult
    func socratic(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(key("socratic", node), live: { await api.socratic(context) })
    }

    @discardableResult
    func feynman(_ node: ConceptNode) async -> Error? {
        let (api, context) = (api, context(for: node))
        return await warm.fill(key("feynman", node), live: { await api.feynman(context) })
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
        var context = context(for: node)
        context["masteredLabels"] = .array(pool.map { .string($0.label) })
        let (api, sent) = (api, context)
        return await warm.fill(key("crucible", node, pool.ids), once: { try await api.crucible(sent) })
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
        let (api, sent) = (api, context)
        return await warm.fill(key("model", node, Self.lensInputs(chunk.id, lens)),
                               live: { await api.model(sent) })
    }

    /// Have `kind` ready for `node` before it is asked for. Fire and forget: a
    /// warm nobody is watching that fails is retried by the click that needed it.
    func warmUp(_ kind: String, for node: ConceptNode) {
        Task {
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
        // The warm drafts into the run itself, so the deck is already there when
        // the tab is opened — and the guard is what keeps the click that
        // follows the warm from filing every card a second time.
        for card in drafted where !cards.contains(where: { $0.card.id == card.id }) {
            cards.append(ScheduledCard(card))
        }
        return nil
    }

    /// Draft the Review queue ahead of the tap, the same way a phase is warmed.
    func warmRetain() { Task { await draftCards(for: uncovered) } }
}

// MARK: - The shared content cache

/// `run_states.caches` is the browser's content column, and this client keeps
/// its half of the run in the same shape — `{ consume: { nodeId: [...] }, … }`.
/// A reading pass written in the browser therefore opens on the phone without a
/// generation, and one written here shows up in the browser the same way.
///
/// What travels is the model's own JSON, never a re-encode of what
/// `PhaseContent.swift` decoded: those types are deliberately narrower than
/// `lib/curriculum/*.ts`, and re-encoding would strip a section's `terms` and
/// `ask` the first time it was written on a phone. See `Landed`.
@MainActor
public extension AtlasStore {
    /// The buckets keyed by node id, which both clients fill. `models` is
    /// shared too but keyed per section and lens — see `lensInputs`. `retain`
    /// stays the browser's own: this client turns a Retain draft into scheduled
    /// cards the moment it lands, so it has nothing to put there, and the
    /// bucket rides through the merge below untouched.
    static let cacheBuckets: Set<String> = ["consume", "socratic", "feynman", "connect", "crucible"]

    /// The lens half of a warm key, and the tail of the browser's own
    /// `model:<nodeId>:<chunkId>:<lens>` — `useGeneration.ts`'s `modelKey`.
    static func lensInputs(_ chunkId: String, _ lens: AltKey) -> String {
        "\(chunkId):\(lens.rawValue)"
    }

    /// Adopt the run's saved content. Called on `open`, once the subject, the
    /// graph and the language a key is built from are all in place.
    func seedWarm(_ caches: [String: JSONValue]) {
        let byId = graph.byId
        for (kind, bucket) in caches {
            for (nodeId, raw) in bucket.fields ?? [:] {
                // `models` is the one bucket not keyed by node id: its key is
                // the whole address of a lens over a section.
                if kind == "models" { seedLens(nodeId, raw, byId); continue }
                guard let node = byId[nodeId] else { continue }
                switch kind {
                case "consume": seed(kind, node, raw, as: [ConsumeChunk].self)
                case "socratic": seed(kind, node, raw, as: [SocraticStep].self)
                case "feynman": seed(kind, node, raw, as: [FeynmanBeat].self)
                case "connect": seed(kind, node, raw, as: ElaborationContent.self)
                case "crucible": seed(kind, node, raw, as: CrucibleContent.self)
                default: continue
                }
            }
        }
    }

    /// The column to upsert: what the row already held, with this device's
    /// generations written over it. A merge for the same reason `RunSnapshot`
    /// is one — a client that rebuilt this object out of its own cache would
    /// delete the two buckets it never fills.
    func cachesRow(over loaded: [String: JSONValue]) -> [String: JSONValue] {
        var caches = loaded
        for (key, raw) in warm.raw {
            guard let slot = Self.cacheSlot(key) else { continue }
            var bucket = caches[slot.bucket]?.fields ?? [:]
            bucket[slot.key] = raw
            caches[slot.bucket] = .object(bucket)
        }
        return caches
    }

    /// Where in the column a warm key belongs — `kind|subject|nodeId|language|inputs`.
    /// Anything else stays out of the shared column: the Retain draft's own key
    /// has four parts, and so does a key whose subject happens to contain a
    /// pipe, which is a run this client keeps to itself rather than files wrong.
    static func cacheSlot(_ key: String) -> (bucket: String, key: String)? {
        let parts = key.split(separator: "|", omittingEmptySubsequences: false)
        guard parts.count == 5 else { return nil }
        let kind = String(parts[0])
        // A lens files under the browser's own address for it, which already
        // carries the node — so the two clients share one walkthrough.
        if kind == "model" {
            guard !parts[4].isEmpty else { return nil }
            return ("models", "model:\(parts[2]):\(parts[4])")
        }
        guard cacheBuckets.contains(kind) else { return nil }
        return (kind, String(parts[2]))
    }

    /// Content the browser wrote, under the key this client would have written
    /// it under. Undecodable content is left where it is rather than dropped —
    /// it is still the browser's to render, and this client simply regenerates.
    private func seed<T: Decodable & Sendable>(
        _ kind: String, _ node: ConceptNode, _ raw: JSONValue, as type: T.Type
    ) {
        guard let value = try? raw.decode(T.self) else { return }
        warm.seed(key(kind, node, cacheInputs(kind, node)), value, raw)
    }

    /// A lens the browser wrote, under the key this client would have written
    /// it under. `model:<nodeId>:<chunkId>:<lens>` in, four parts out; anything
    /// shaped otherwise is content this client has no address for.
    private func seedLens(_ address: String, _ raw: JSONValue, _ byId: [String: ConceptNode]) {
        let parts = address.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 4, parts[0] == "model", let node = byId[String(parts[1])],
              let value = try? raw.decode([ConsumeModelBeat].self)
        else { return }
        warm.seed(key("model", node, "\(parts[2]):\(parts[3])"), value, raw)
    }

    /// The pool half of a key. Connect and Crucible are drawn from what the
    /// learner already owns, so their content is keyed on it — while the web
    /// keys on the node alone. Seeding under the *current* pool is what adopts
    /// its answer: the browser would serve that content again too.
    private func cacheInputs(_ kind: String, _ node: ConceptNode) -> String {
        kind == "connect" || kind == "crucible" ? learned(besides: node).ids : ""
    }
}

private extension Array where Element == ConceptNode {
    /// The pool as one string — part of a key, never shown.
    var ids: String { map(\.id).joined(separator: ",") }
}
