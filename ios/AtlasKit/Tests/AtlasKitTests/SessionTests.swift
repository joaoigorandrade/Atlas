import Foundation
import Testing
@testable import AtlasKit

/// The spiral's two rules that a screen must never own: what a phase writes to
/// the map, and what order the phases run in. Everything else on screens 14-18
/// is layout — this is the part that lies to the learner if it drifts.

/// `done` seeds "cadeia"'s phase ledger — the record mastery is derived from.
/// A state with no ledger behind it is not a state a real node reaches: the
/// catalogue migration backfills one for every run in flight, precisely so a
/// mastered node cannot be walked backwards by the next phase it closes.
@MainActor private func store(_ states: StateMap = [:], done: [Phase] = []) -> AtlasStore {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(
            nodes: [
                ConceptNode(id: "lat", label: "Limites laterais"),
                ConceptNode(id: "cadeia", label: "Regra da cadeia"),
            ],
            edges: [ConceptEdge("lat", "cadeia")]
        ),
        states: states,
        subject: "Cálculo I"
    )
    if !done.isEmpty { store.phasesDone["cadeia"] = done }
    return store
}

/// Every gate of the `concept` ladder but the Crucible — what a node that has
/// worked its way up to the transfer test actually carries.
private func upToCrucible() -> [Phase] {
    planGates(phasePlans[.concept]!).filter { $0 != .crucible }
}

/// A pass on "Regra da cadeia", plus the store it writes to — the writes are
/// the whole point of these tests, so both come back.
@MainActor private func session(
    _ states: StateMap = [:], done: [Phase] = []
) -> (SessionViewModel, AtlasStore) {
    let store = store(states, done: done)
    return (SessionViewModel(node: store.graph.nodes[1], store: store), store)
}

@MainActor
@Test func openingAPassMarksNothingUntilTheLearnerDoesSomething() {
    let owned = store(["cadeia": .mastered])
    _ = SessionViewModel(node: owned.graph.nodes[1], store: owned)
    // A node already past Learning is left where it is — nothing on this screen
    // is a reason to walk mastery backwards.
    #expect(owned.states["cadeia"] == .mastered)

    // Opening the screen and backing out is not learning the concept, so
    // nothing is written until the learner does something.
    let fresh = store(["lat": .mastered])
    let pass = SessionViewModel(node: fresh.graph.nodes[1], store: fresh)
    #expect(fresh.states["cadeia"] == nil)

    // The first thing the learner actually does is what marks it.
    pass.markWorked()
    #expect(fresh.states["cadeia"] == .learning)
}

/// Neither arriving nor a first check unlocks the next concept: `meetsPrereq`
/// wants a finished pass, and the map must stay locked behind one in progress.
@MainActor
@Test func aTapAndABackSwipeDoesNotUnlockTheNextConcept() {
    let fresh = store(["lat": .mastered])
    let locked = fresh.graph.nodes.first { fresh.display[$0.id] == .unknown }
    _ = SessionViewModel(node: fresh.graph.nodes[1], store: fresh)
    if let locked { #expect(fresh.display[locked.id] == .unknown) }
}

@MainActor
@Test func theSpiralRunsTheNodesOwnPlanAndEndsAtItsLastGate() {
    // No kind on the node, so it runs `concept`'s ladder — which is what a row
    // with no `phase_plan` falls back to, and which is *not* the six rungs every
    // node used to run.
    let (pass, store) = session()
    let gates = planGates(phasePlans[.concept]!)
    #expect(pass.phase == .consume)
    for expected in gates.dropFirst() {
        pass.advance()
        #expect(pass.phase == expected)
    }
    // Retido is not a session phase: past the plan's last gate the map takes
    // over, and every rung behind it is in the ledger.
    pass.advance()
    #expect(pass.finished)
    #expect(pass.phase == gates.last)
    #expect(store.phasesDone["cadeia"] == gates)
    // Which is exactly what makes it green, with no literal written anywhere.
    #expect(store.states["cadeia"] == .mastered)
}

@MainActor
@Test func aProcedureWalksItsOwnLadderRatherThanAConceptsOne() {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [
            ConceptNode(id: "t", label: "Titulação", kind: .procedure),
        ]),
        states: [:],
        subject: "Química"
    )
    let pass = SessionViewModel(node: store.graph.nodes[0], store: store)
    #expect(pass.phase == .consume)
    pass.advance()
    // Trace, not Socratic: a procedure is executed, not argued with.
    #expect(pass.phase == .trace)
}

@MainActor
@Test func connectLeavesTheNodeShakyRatherThanGreen() {
    let (pass, store) = session(["lat": .mastered])
    pass.finishConnect()
    pass.advance()
    // Understood and wired, but nothing has proven it transfers yet.
    #expect(store.states["cadeia"] == .shaky)
    #expect(store.shakyReasons["cadeia"] == .connectComplete)
}

/// The dead end the inversion could have shipped: "now prove it transfers" only
/// means something while the plan still has a gate that can prove it. On a plan
/// that *ends* at Connect the reason is a trap — a Shaky node re-opens its last
/// gate, and closing that gate would write the reason again, forever.
@MainActor
@Test func aPlanThatEndsAtConnectIsFinishedByItRatherThanTrapped() {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [
            ConceptNode(id: "n", label: "Curto", phasePlan: [.consume, .connect, .retain]),
        ]),
        states: [:],
        subject: "Cálculo I"
    )
    let node = store.graph.nodes[0]
    store.phasesDone["n"] = [.consume]
    let pass = SessionViewModel(node: node, store: store, phase: .connect)
    pass.finishConnect()
    pass.advance()
    #expect(store.shakyReasons["n"] == nil)
    #expect(store.states["n"] == .mastered)
    // And nothing is re-opened: the CTA has no gate left to send them back to.
    #expect(primaryPhase(node.plan, store.phasesDone["n"] ?? [], state: .mastered) == nil)
}

@MainActor
@Test func onlyAConfirmedTransferTurnsTheNodeGreen() {
    let gap = GapSpec(id: "cadeia-gap", label: "Taxa de dentro", reason: "não atravessou", dx: 40, dy: 60)

    let (failed, failedStore) = session(["lat": .mastered])
    failed.settleCrucible(
        CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "A taxa interna",
                          gapReason: "ficou de fora", reExplain: nil),
        gap: gap
    )
    #expect(failedStore.states["cadeia"] == .shaky)
    #expect(failedStore.states[gap.id] == .gap)
    // The judge's own words name the gap — the content's draft is the fallback.
    #expect(failedStore.graph.nodes.first { $0.id == gap.id }?.label == "A taxa interna")
    // A gap hangs on a dashed edge: it must never lock anything below it.
    #expect(failedStore.graph.edges.contains { $0.to == gap.id && $0.dashed })

    // A node that jumped straight here: the transfer holds, the rung closes —
    // and it is still Learning, because its earlier gates are still open. The
    // Crucible used to be the one place `.mastered` was written, so passing it
    // promoted a node that had skipped the whole ladder.
    let (jumped, jumpedStore) = session(["lat": .mastered])
    jumped.settleCrucible(
        CrucibleJudgement(outcome: "pass", transfer: [], gapLabel: nil, gapReason: nil, reExplain: nil),
        gap: gap
    )
    #expect(jumpedStore.states["cadeia"] == .learning)
    #expect(jumpedStore.phasesDone["cadeia"] == [.crucible])

    let (passed, passedStore) = session(["lat": .mastered], done: upToCrucible())
    passed.settleCrucible(
        CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: nil, gapReason: nil, reExplain: nil),
        gap: gap
    )
    passed.settleCrucible(
        CrucibleJudgement(outcome: "pass", transfer: [], gapLabel: nil, gapReason: nil, reExplain: nil),
        gap: gap
    )
    // Transfer confirmed: green, and the first attempt's gap leaves the map.
    #expect(passedStore.states["cadeia"] == .mastered)
    #expect(passedStore.states[gap.id] == nil)
    #expect(passedStore.graph.nodes.contains { $0.id == gap.id } == false)
    #expect(passedStore.graph.edges.contains { $0.to == gap.id } == false)
}

@Test func aFigureWithACycleStillLaysOutFlatInsteadOfHanging() {
    let figure = ConsumeFigure(
        nodes: [.init(id: "a", label: "A"), .init(id: "b", label: "B"), .init(id: "c", label: "C")],
        edges: [.init(from: "a", to: "b"), .init(from: "b", to: "c"), .init(from: "c", to: "a")]
    )
    // The point is that it comes back at all — the relaxation is capped at the
    // node count, so a loop costs three passes rather than forever, and every
    // node still gets a row to draw in.
    let layers = figureLayers(figure)
    #expect(layers.count == 3)
    // A loop's layers keep climbing while the passes last; what matters for the
    // drawing is that they can't produce more rows than there are nodes.
    #expect(Set(layers.values).count <= figure.nodes.count)

    let chain = ConsumeFigure(
        nodes: [.init(id: "a", label: "A"), .init(id: "b", label: "B")],
        edges: [.init(from: "a", to: "b")]
    )
    #expect(figureLayers(chain) == ["a": 0, "b": 1])
}

@MainActor
@Test func aRedoOpensTheRequestedPhaseAndEndsOnTheMapWhenNothingIsOwed() {
    let owned = store(["cadeia": .mastered], done: planGates(phasePlans[.concept]!))
    let redo = SessionViewModel(node: owned.graph.nodes[1], store: owned, phase: .feynman)
    #expect(redo.phase == .feynman)
    // The whole ladder is in the ledger, so there is no rung to hand to — the
    // web's `enterOwedPhase` goes back to the map here, and so does the phone.
    #expect(redo.handOff == nil)
    redo.advance()
    #expect(redo.finished)
    // Redoing an earlier phase doesn't walk the node's mastery backwards: the
    // rung was already in the ledger, and closing it again is a no-op.
    #expect(owned.states["cadeia"] == .mastered)
}

@MainActor
@Test func aRepeatCrucibleFailureRenamesTheGapInsteadOfKeepingTheFirstWording() {
    let gap = GapSpec(id: "cadeia-gap", label: "Rascunho", reason: "rascunho", dx: 40, dy: 60)
    let (pass, store) = session(["lat": .mastered])
    pass.settleCrucible(CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "Primeira",
                                          gapReason: "primeira", reExplain: nil), gap: gap)
    pass.settleCrucible(CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "Segunda",
                                          gapReason: "segunda", reExplain: nil), gap: gap)
    // `spawnGap` is idempotent by id, which is right — but the second judgement
    // named the missing sub-concept again, and the map kept the first wording.
    #expect(store.graph.nodes.filter { $0.id == gap.id }.count == 1)
    #expect(store.graph.nodes.first { $0.id == gap.id }?.label == "Segunda")
    #expect(store.graph.nodes.first { $0.id == gap.id }?.summary == "segunda")
}

@MainActor
@Test func theConnectPoolIsWhatTheLearnerOwns_neverAGapAndNeverUnbounded() {
    let store = store(["lat": .mastered])
    // A gap the learner opened a pass on is `.learning`, and offering it back
    // as "a concept you already know" is the bug elaboration exists to avoid.
    store.graph.nodes.append(ConceptNode(id: "g", label: "Lacuna", gap: true))
    store.states["g"] = .learning
    for index in 0..<12 {
        store.graph.nodes.append(ConceptNode(id: "n\(index)", label: "N\(index)"))
        store.states["n\(index)"] = .learning
    }
    let pool = store.learned(besides: store.graph.nodes[1])
    #expect(pool.contains { $0.id == "g" } == false)
    #expect(pool.contains { $0.id == "cadeia" } == false)
    // Capped at 8 — the pool is in the prompt *and* in the cache key.
    #expect(pool.count == 8)
    // Most-owned first.
    #expect(pool.first?.id == "lat")
}

/// A learner who jumped from the map straight to Socratic with Consume still
/// open is owed Consume next — not the plan's successor. The phone used to say
/// "Seguir para Feynman" and open it while the web opened Consume.
@MainActor
@Test func aHandOffOpensTheSkippedRungRatherThanThePlansSuccessor() {
    let (pass, store) = session(["lat": .mastered])
    let jumped = SessionViewModel(node: pass.node, store: store, phase: .socratic)
    #expect(jumped.handOff == .consume)
    jumped.settleSocratic(.unaided)
    #expect(jumped.phase == .consume)
    #expect(store.phasesDone["cadeia"] == [.socratic])
    // Consume closes, and the next owed rung is Discriminate — Socratic is
    // already in the ledger, so it is walked past rather than reopened.
    #expect(jumped.handOff == .discriminate)
    jumped.advance()
    #expect(jumped.phase == .discriminate)
    jumped.advance()
    #expect(jumped.phase == .feynman)
}

/// A failed run leaves its rung open, but the hand-off still walks on: the
/// phase just closed counts as behind the learner for where they go next.
@MainActor
@Test func aFailedRunWalksOnInsteadOfReopeningItself() {
    let (pass, store) = session(["lat": .mastered], done: [.consume])
    let trying = SessionViewModel(node: pass.node, store: store, phase: .discriminate)
    trying.advance(passed: false)
    #expect(trying.phase == .socratic)
    #expect(store.phasesDone["cadeia"] == [.consume])
}
