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
    public private(set) var phase: Phase { didSet { entered(phase) } }
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
        // What the node is owed, corrected by what was actually read: a reading
        // left part-way through opens back on the reading, not three phases
        // past it.
        let owed = readingPhaseIndex(
            store.display[node.id] ?? .unknown,
            reviewed: store.reviewed.contains(node.id),
            progress: store.consumeProgress[node.id]
        )
        self.phase = phase ?? Phase.allCases[max(0, min(owed, Phase.allCases.count - 2))]
        // Arriving is the evidence: a node being worked is Learning, whatever
        // else happens on the screen. Anything already past that is left alone.
        //
        // The reading is the exception, and it is where the web draws the line
        // too: opening a pass and backing out of its first section is not work,
        // and writing Learning for it is what used to tick Consume *and*
        // Socratic off a node nobody had read. `AtlasStore.record` writes it
        // the moment the second section is actually reached.
        let state = store.states[node.id] ?? .unknown
        if state == .unknown, self.phase != .consume { store.states[node.id] = .learning }
        store.markActiveToday()
        entered(self.phase)
    }

    /// What arriving at a phase writes and warms. Called from `init` as well,
    /// where a `didSet` doesn't fire.
    private func entered(_ phase: Phase) {
        // The reading handed off. Without this, a pass read to the end and then
        // left for the map is indistinguishable from one that went on to be
        // questioned — see `readingPhaseIndex`.
        if phase == .socratic { store.handOff(node.id) }
        warmNext()
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
        guard let next = phase.next else { return finished = true }
        phase = next
    }

    /// Connect closes: the concept is understood and wired, but nothing has
    /// proven it transfers. That is exactly Shaky — `connect-complete`.
    public func finishConnect() {
        let state = store.states[node.id] ?? .unknown
        if state == .unknown || state == .learning { store.states[node.id] = .shaky }
    }

    /// The one path to green, and the one path to a spawned gap.
    ///
    /// A confirmed transfer lifts the node to Mastered and takes the
    /// first-attempt gap back off the map; a failure flips it Shaky and hangs
    /// the sub-concept that didn't carry over under it.
    public func settleCrucible(_ judgement: CrucibleJudgement, gap: GapSpec) {
        guard judgement.passed else {
            store.states[node.id] = .shaky
            let named = GapSpec(
                id: gap.id,
                label: judgement.gapLabel ?? gap.label,
                reason: judgement.gapReason ?? gap.reason,
                dx: gap.dx, dy: gap.dy
            )
            store.graph = spawnGap(store.graph, parentId: node.id, named)
            store.states[named.id] = .gap
            return
        }
        store.graph.nodes.removeAll { $0.id == gap.id }
        store.graph.edges.removeAll { $0.from == gap.id || $0.to == gap.id }
        store.states[gap.id] = nil
        store.states[node.id] = .mastered
    }

    /// A teach-back leaves its unresolved sub-points on the map: a beat the
    /// learner skipped or got confused about is a real gap, in their own
    /// material's words.
    public func writeFeynmanGaps(_ judgement: FeynmanJudgement, beats: [FeynmanBeat]) {
        for row in judgement.verdicts where row.verdict != "good" {
            guard let beat = beats[safe: row.i] else { continue }
            store.graph = spawnGap(store.graph, parentId: node.id, beat.gap)
            if store.graph.nodes.contains(where: { $0.id == beat.gap.id }) {
                store.states[beat.gap.id] = .gap
            }
        }
    }
}
