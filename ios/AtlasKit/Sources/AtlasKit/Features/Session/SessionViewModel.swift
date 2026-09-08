import Observation
import SwiftUI

/// One pass through the spiral on one node — screens 14 to 18.
///
/// It owns two things and nothing else: which phase is on screen, and the
/// mastery the phases write back. The content each phase renders belongs to
/// that phase's view; what a phase *means* for the map lives here, in one
/// place, mirroring `useSpiral.ts`.
@Observable
@MainActor
public final class SessionViewModel: Identifiable {
    public let node: ConceptNode
    public private(set) var phase: Phase { didSet { warmNext(); noteReading() } }
    /// Set when the last phase hands back — the map takes the screen again.
    public private(set) var finished = false

    /// The run itself: the phases read their content off it and write their
    /// mastery back through it.
    public let store: AtlasStore

    public nonisolated var id: String { node.id }

    /// Opens on the phase the node is actually owed. A locked node has no
    /// session at all, so the caller checks `phaseIndex` before making one.
    public init(node: ConceptNode, store: AtlasStore, phase: Phase? = nil) {
        self.node = node
        self.store = store
        // `.retained` belongs to the Review tab: this shell has no screen for
        // it and no bar to leave one by, so a redo that asks for it is clamped
        // to the last phase the spiral actually runs.
        let last = Phase.allCases.count - 2
        let asked = Phase.allCases.firstIndex(of: phase ?? store.owedPhase(node)) ?? 0
        self.phase = Phase.allCases[max(0, min(asked, last))]
        warmNext()
        noteReading()
    }

    /// A day on the streak is adherence, and opening a screen is not adherence:
    /// a learner who taps a node, sees the wrong phase and backs out has done
    /// no work. Every phase that gets somewhere calls this.
    ///
    /// It is also where the node becomes Learning. That used to happen in
    /// `init`, on the reasoning that arriving is the evidence — but `isLearned`
    /// counts Learning as a *satisfied prerequisite*, so merely opening a node
    /// and backing out lit up everything downstream of it. Tapping a concept is
    /// not learning it, and it must not unlock the next one. The rule this
    /// function already stated for the streak is the right one for the map too:
    /// the first thing the learner actually does is the evidence.
    public func markWorked() {
        store.markActiveToday()
        if (store.states[node.id] ?? .unknown) == .unknown { store.states[node.id] = .learning }
    }

    /// The reading record the spiral reads back. Opening Consume is what
    /// creates it — without that, a node marked Learning above and then left
    /// would claim both Consume and Socratic (`readingPhaseIndex`). Reaching
    /// Socratic is the hand-off, and the only thing that ends the reading.
    private func noteReading() {
        switch phase {
        case .consume: store.note(reading: node.id)
        case .socratic: store.note(reading: node.id, handedOff: true)
        default: break
        }
    }

    /// Speculate one phase ahead. A learner reading a pass is exactly when the
    /// next one should be written — so by the time they tap Continue the
    /// content is a state change rather than a round trip.
    private func warmNext() {
        guard let kind = phase.next?.kind else { return }
        store.warmUp(kind, for: node)
    }

    /// The context every kind on this node shares. Built by the store, never
    /// here: a warm and the click after it address the same content only if
    /// exactly one function decides the inputs.
    public var context: [String: JSONValue] { store.context(for: node) }

    /// Nodes the learner already owns — what Connect may wire into and what a
    /// Crucible problem may interleave. Mirrors `CONNECT_POOL_STATES`.
    public var learnedElsewhere: [ConceptNode] { store.learned(besides: node) }

    /// The next phase in the spiral. Past the Crucible there is no next: the
    /// pass is over and the map takes the screen back.
    public func advance() {
        markWorked()
        guard let next = phase.next else { return finished = true }
        phase = next
    }

    /// Connect closes: the concept is understood and wired, but nothing has
    /// proven it transfers. That is exactly Shaky — `connect-complete`.
    public func finishConnect() {
        let state = store.states[node.id] ?? .unknown
        if state == .unknown || state == .learning {
            store.states[node.id] = .shaky
            store.shakyReasons[node.id] = .connectComplete
        }
    }

    /// The one path to green, and the one path to a spawned gap.
    ///
    /// A confirmed transfer lifts the node to Mastered and takes the
    /// first-attempt gap back off the map; a failure flips it Shaky and hangs
    /// the sub-concept that didn't carry over under it.
    public func settleCrucible(_ judgement: CrucibleJudgement, gap: GapSpec) {
        guard judgement.passed else {
            store.states[node.id] = .shaky
            store.shakyReasons[node.id] = .crucibleFail
            let named = GapSpec(
                id: gap.id,
                label: judgement.gapLabel ?? gap.label,
                reason: judgement.gapReason ?? gap.reason,
                dx: gap.dx, dy: gap.dy
            )
            var graph = spawnGap(store.graph, parentId: node.id, named)
            // `spawnGap` is idempotent by id, which is the right rule — but a
            // second failure judges the gap again, and the map kept the first
            // attempt's wording. Rename in place rather than adding a twin.
            if let index = graph.nodes.firstIndex(where: { $0.id == named.id }) {
                graph.nodes[index].label = named.label
                graph.nodes[index].summary = named.reason
            }
            store.graph = graph
            store.states[named.id] = .gap
            return
        }
        // A clean first-attempt pass never spawned anything: two whole-graph
        // assignments, two rederives and two saves to remove a node that was
        // never there.
        if store.graph.nodes.contains(where: { $0.id == gap.id }) {
            var graph = store.graph
            graph.nodes.removeAll { $0.id == gap.id }
            graph.edges.removeAll { $0.from == gap.id || $0.to == gap.id }
            store.graph = graph
            store.states[gap.id] = nil
        }
        store.states[node.id] = .mastered
    }

    /// A teach-back leaves its unresolved sub-points on the map: a beat the
    /// learner skipped or got confused about is a real gap, in their own
    /// material's words.
    ///
    /// A row the judge did not rule on is a skip, not a pass: silence about a
    /// sub-point the learner never mentioned is exactly the finding this phase
    /// exists for. The server validator refuses such a payload today; this is
    /// the client not depending on that.
    public func writeFeynmanGaps(_ judgement: FeynmanJudgement, beats: [FeynmanBeat]) {
        let ruled = Dictionary(judgement.verdicts.map { ($0.i, $0) }, uniquingKeysWith: { first, _ in first })
        // One assignment, one rederive, one debounced save — not one per row.
        var graph = store.graph
        var spawned: [String] = []
        for (index, beat) in beats.enumerated() {
            let row = ruled[index]
            guard row?.verdict != "good" else { continue }
            // The learner's own words are the whole context a later pass on
            // this gap opens with; the pre-written reason was drafted before
            // they said anything.
            let named = GapSpec(
                id: beat.gap.id,
                label: beat.gap.label,
                reason: row?.quote.map { String(localized: "Você disse: “\($0)” — \(beat.gap.reason)") } ?? beat.gap.reason,
                dx: beat.gap.dx, dy: beat.gap.dy
            )
            graph = spawnGap(graph, parentId: node.id, named)
            if graph.nodes.contains(where: { $0.id == named.id }) { spawned.append(named.id) }
        }
        store.graph = graph
        for id in spawned { store.states[id] = .gap }
    }
}
