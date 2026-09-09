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

    /// The Socratic pass closed — and "closed" is not automatically
    /// "understood". Where the learner goes next is the outcome's call and not
    /// the CTA's: a gap pass reconstructed unaided closes the gap and ends the
    /// session; a pass that had to be told through hands *back* into the
    /// reading with a real gap attached under it; anything else hands off to
    /// the teach-back. Mirrors `advanceFromSocratic` in `useSpiral.ts`.
    public func settleSocratic(_ outcome: SocraticOutcome) {
        markWorked()
        // Nothing left to resume: a finished pass that stays in the row reopens
        // as a finished transcript on the next entry.
        store.clearPass(node.id)
        if node.gap == true {
            // The gap was the whole concept here. Reconstructing it unaided is
            // what takes it off the map; leaning on being told leaves it, red,
            // exactly where it was.
            if outcome == .unaided, store.graph.nodes.contains(where: { $0.id == node.id }) {
                var graph = store.graph
                graph.nodes.removeAll { $0.id == node.id }
                graph.edges.removeAll { $0.from == node.id || $0.to == node.id }
                store.graph = graph
                store.states[node.id] = nil
                store.clearPass(node.id)
            }
            // Either way the pass is over: a gap node has no teach-back to
            // hand off to, so the map takes the screen back.
            finished = true
            return
        }
        guard outcome == .flagged else {
            guard let next = phase.next else { return finished = true }
            phase = next
            return
        }
        // ponytail: a synthetic gap — no model-authored label or reason, unlike
        // Feynman's and the Crucible's. Promote it to a generated one if
        // "foundations" ever needs richer framing.
        let spec = GapSpec(
            id: "gap-soc-\(node.id)",
            label: String(localized: "\(node.label) — fundamentos"),
            reason: String(localized: "Apoiou-se na resposta pronta mais de uma vez na passagem Socrática"),
            dx: -140, dy: 150
        )
        store.graph = spawnGap(store.graph, parentId: node.id, spec)
        store.states[spec.id] = .gap
        // The flag on its own would be passive. A pass that had to be told
        // through is a reading that didn't land, so the hand-off runs backwards
        // — into the reading, reopened at the top with nothing collapsed.
        store.reopen(reading: node.id)
        phase = .consume
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
    /// It runs on the way *out* of the phase, from the verdicts as they finally
    /// stand — not the instant the judge answers. Writing at submit meant a
    /// learner who read the report and backed out had still mutated the map,
    /// and a row taken from `confused` to `good` by a fix or a second pass left
    /// its red node hanging under the concept forever, because nothing ever
    /// removed one. So this both spawns and removes, the way `settleCrucible`
    /// does. Mirrors `advanceFromFeynman`.
    public func settleFeynman(_ verdicts: [String: TeachVerdict], beats: [FeynmanBeat], quotes: [String: String]) {
        // One assignment, one rederive, one debounced save — not one per row.
        var graph = store.graph
        var spawned: [String] = []
        var cleared: [String] = []
        for beat in beats {
            let verdict = verdicts[beat.id] ?? .skipped
            guard verdict.isGap else {
                // Explained this time. The node it left behind last time is a
                // lie about what the learner owes, so it comes off.
                if graph.nodes.contains(where: { $0.id == beat.gap.id }) {
                    graph.nodes.removeAll { $0.id == beat.gap.id }
                    graph.edges.removeAll { $0.from == beat.gap.id || $0.to == beat.gap.id }
                    cleared.append(beat.gap.id)
                }
                continue
            }
            // The learner's own words are the whole context a later pass on
            // this gap opens with; the pre-written reason was drafted before
            // they said anything.
            let named = GapSpec(
                id: beat.gap.id,
                label: beat.gap.label,
                reason: quotes[beat.id].map { String(localized: "Você disse: “\($0)” — \(beat.gap.reason)") } ?? beat.gap.reason,
                dx: beat.gap.dx, dy: beat.gap.dy
            )
            graph = spawnGap(graph, parentId: node.id, named)
            // `spawnGap` is idempotent by id: a second pass that still owes the
            // row must re-word it in place rather than leave the first
            // attempt's quote on the map.
            if let index = graph.nodes.firstIndex(where: { $0.id == named.id }) {
                graph.nodes[index].summary = named.reason
                spawned.append(named.id)
            }
        }
        store.graph = graph
        for id in spawned { store.states[id] = .gap }
        for id in cleared { store.states[id] = nil }
        // The gaps are on the map now — the pass has nothing left to come back to.
        store.clearTeachBack(node.id)
    }
}
