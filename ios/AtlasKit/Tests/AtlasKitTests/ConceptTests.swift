import Foundation
import Testing
@testable import AtlasKit

/// Frontier derivation is the one rule every surface reads through, so it is the
/// one thing worth a test: an unknown node unlocks only when every solid
/// prerequisite is learned, gap nodes never unlock, and dashed edges never lock.
@Test func frontierIsDerivedFromPrerequisites() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "a", label: "Derivada"),
            ConceptNode(id: "b", label: "Composição"),
            ConceptNode(id: "c", label: "Regra da cadeia"),
            ConceptNode(id: "g", label: "Lacuna", gap: true),
        ],
        edges: [ConceptEdge("a", "c"), ConceptEdge("b", "c"), ConceptEdge("c", "g", dashed: true)]
    )

    // One prerequisite short: c stays locked, a and b are the frontier.
    var shown = displayStates(["a": .mastered], graph)
    #expect(shown["c"] == .unknown)
    #expect(shown["b"] == .frontier)

    // Both met: c lights up. The gap node never does, dashed edge or not.
    shown = displayStates(["a": .mastered, "b": .shaky], graph)
    #expect(shown["c"] == .frontier)
    #expect(shown["g"] == .unknown)

    // A prerequisite still mid-pass is not met: `learning` is written on the
    // first check in the reading, and starting a concept must not unlock what
    // builds on it.
    shown = displayStates(["a": .mastered, "b": .learning], graph)
    #expect(shown["c"] == .unknown)

    // Stored progress always wins over derivation.
    shown = displayStates(["a": .mastered, "b": .mastered, "c": .learning], graph)
    #expect(shown["c"] == .learning)
}

/// A gap node keeps its own colour once its parent is learned — the dashed edge
/// never unlocks it, and `.gap` is stored, so derivation must leave it alone.
@Test func gapNodesKeepTheirState() {
    let graph = ConceptGraph(
        nodes: [ConceptNode(id: "a", label: "Derivada"), ConceptNode(id: "g", label: "Lacuna", gap: true)],
        edges: [ConceptEdge("a", "g", dashed: true)]
    )
    #expect(displayStates(["a": .mastered, "g": .gap], graph)["g"] == .gap)
}

/// The plan's order, not the generator's: leverage first for a deadline goal,
/// foundations first for mastery.
@Test func frontierIsOrderedToTheGoal() {
    // `deep` unlocks two concepts; `wide` unlocks none but is drawn first.
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "wide", label: "Solta", x: 0),
            ConceptNode(id: "deep", label: "Profunda", x: 10),
            ConceptNode(id: "c1", label: "Um", x: 20),
            ConceptNode(id: "c2", label: "Dois", x: 30),
        ],
        edges: [ConceptEdge("deep", "c1"), ConceptEdge("c1", "c2")]
    )
    let shown = displayStates([:], graph)
    #expect(orderedFrontier(shown, graph, .exam).map(\.id) == ["deep", "wide"])
    #expect(orderedFrontier(shown, graph, .mastery).map(\.id) == ["wide", "deep"])
}

/// The inversion itself: state is *derived* from the record of finished phases,
/// so a plan with no Crucible in it reaches Mastered the same way one with a
/// Crucible does. This is what `readingPhaseIndex` and five hand-written mastery
/// literals used to stand in the way of.
@Test func stateIsDerivedFromTheLedger() {
    let plan = phasePlans[.fact]!

    #expect(stateFromPlan(plan, []) == .unknown)
    // Begun and nothing finished is real progress — without the flag a learner
    // two sections into the reading drops back to displaying as frontier.
    #expect(stateFromPlan(plan, [], started: true) == .learning)
    #expect(stateFromPlan(plan, [.consume]) == .learning)

    // Every *gate* done is Mastered. Retain is not a gate: it is weeks of review
    // history, not something the learner does in a session, so waiting on it
    // would mean no node was ever green until it had been reviewed.
    let gates: [Phase] = [.consume, .discriminate, .drill, .connect, .recall]
    #expect(stateFromPlan(plan, gates) == .mastered)
    #expect(!gates.contains(.retain))
    // A reason on the node holds it Shaky however full the ledger is.
    #expect(stateFromPlan(plan, gates, shaky: .crucibleFail) == .shaky)
}

/// A `fact` never runs the Crucible, and this is the test that says the ladder
/// it *does* run can still be finished. Before the inversion the Crucible was
/// the only path to green.
@Test func aFactLadderReachesMasteredWithoutACrucible() {
    let fact = ConceptNode(id: "f", label: "Fato", kind: .fact)
    #expect(!fact.plan.contains(.crucible))
    #expect(!fact.plan.contains(.socratic))
    // Every plan is a subsequence of the catalogue's canonical order, which is
    // what keeps a phase index monotone and the rail left to right.
    // Over every (kind, domain) pair, not just the four kinds: the domain axis
    // is a second lever over the same catalogue and owes the same invariants.
    for kind in NodeKind.allCases {
        for domain in Domain.allCases {
            let plan = resolvePlan(kind, domain)
            let positions = plan.compactMap { Phase.allCases.firstIndex(of: $0) }
            #expect(positions == positions.sorted(), "\(kind)/\(domain)")
            #expect(plan.first == .consume, "\(kind)/\(domain)")
            #expect(plan.last == .retain, "\(kind)/\(domain)")
            #expect(Set(plan).count == plan.count, "\(kind)/\(domain)")
        }
    }
    // And every phase in the catalogue has at least one home — one that does not
    // is dead code with a screen behind it.
    //
    // A home is now EITHER table: three of the phases exist for a domain rather
    // than for a kind, so `phasePlans` alone would call them dead.
    for phase in Phase.allCases {
        #expect(NodeKind.allCases.contains { kind in
            Domain.allCases.contains { resolvePlan(kind, $0).contains(phase) }
        }, "\(phase) has no home")
    }
}

/// `general` changes nothing. The guarantee the whole axis rests on: shipping it
/// cannot re-cut a ladder any run is already partway through.
@Test func aGeneralDomainRunsExactlyTheLadderItsKindAlwaysDid() {
    for kind in NodeKind.allCases {
        #expect(resolvePlan(kind, .general) == phasePlans[kind]!)
    }
}

/// The structural bug the axis exists to fix: `phasePlans[.concept]` carries no
/// execution rung, so a `concept` node could reach mastered without the learner
/// ever running anything.
@Test func aFormalConceptGetsSomethingToActuallyCompute() {
    for phase in [Phase.trace, .perform, .drill] {
        #expect(!phasePlans[.concept]!.contains(phase))
        #expect(resolvePlan(.concept, .formal).contains(phase))
    }
}

/// Explaining the preterite in your own words is not speaking Spanish, so the
/// prose rungs come off whatever the kind says.
@Test func aPerformativeNodeDropsTheProseRungsWhateverItsKind() {
    for kind in NodeKind.allCases {
        let plan = resolvePlan(kind, .performative)
        for phase in [Phase.socratic, .feynman, .crucible] {
            #expect(!plan.contains(phase), "\(kind)/performative still runs \(phase)")
        }
        #expect(plan.contains(.produce))
    }
}

/// The rung a node is on, and the one its CTA opens, both come from its own
/// plan. A Shaky node is the exception to "first unfinished": it is owed its
/// plan's last gate again, which is what every shaky line promises.
@Test func theOwedPhaseFollowsTheNodesOwnPlan() {
    let procedure = ConceptNode(id: "p", label: "Procedimento", kind: .procedure)
    let plan = procedure.plan

    #expect(primaryPhase(plan, [], state: .unknown) == .consume)
    #expect(primaryPhase(plan, [.consume], state: .learning) == .trace)
    // Not Socratic, which a `procedure` does not run at all.
    #expect(primaryPhase(plan, [.consume], state: .learning) != .socratic)
    #expect(primaryPhase(planGates(plan), planGates(plan), state: .shaky) == .crucible)
    // Nothing left to open: the CTA is the review queue, not a seventh rung.
    #expect(primaryPhase(plan, planGates(plan), state: .mastered) == nil)

    #expect(phaseIndex(plan, [], state: .unknown) == -1)
    #expect(phaseIndex(plan, [.consume], state: .learning) == 1)
    // Mastered alone does not grant Retido ✓ — a real review does, so the node
    // sits *on* the last rung rather than past it.
    #expect(phaseIndex(plan, planGates(plan), state: .mastered) == plan.count - 1)
    #expect(phaseIndex(plan, planGates(plan), state: .mastered, reviewed: true) == plan.count)
}

/// The catalogue's own rule: a phase earns its place by extracting a signal no
/// other phase can. Two phases with one signal is a setting wearing a rung's
/// clothes, and the web pins this the same way.
@Test func noTwoPhasesClaimTheSameSignal() {
    let signals = Phase.allCases.map(\.signal)
    #expect(Set(signals).count == signals.count)
}

/// A node whose row predates the catalogue carries no plan, and a client one
/// release behind can be handed a plan naming a phase it has no screen for.
/// Neither may refuse the map.
@Test func anUnknownPlanDegradesRatherThanThrows() throws {
    let wire = """
    {"id":"n","label":"N","kind":"telepathy","phasePlan":["consume","teleport","retain"]}
    """
    let node = try JSONDecoder().decode(ConceptNode.self, from: Data(wire.utf8))
    // An unknown kind is `concept`, which is what every node was before kinds.
    #expect(node.kind == .concept)
    // The rung this build cannot open is dropped; the rest of the ladder stands.
    #expect(node.phasePlan == [.consume, .retain])

    let bare = try JSONDecoder().decode(ConceptNode.self, from: Data(#"{"id":"n","label":"N"}"#.utf8))
    #expect(bare.phasePlan == nil)
    #expect(bare.plan == phasePlans[.concept])

    // A row that names no plan — a spawned gap, whose `phase_plan` column now
    // defaults to empty rather than to the legacy six. The server omits an
    // empty column from the wire, but a plan sent as `[]` has to mean the same
    // thing, or the node runs a different ladder after a reload than the one it
    // ran in the session that spawned it.
    let unplanned = try JSONDecoder().decode(
        ConceptNode.self,
        from: Data(#"{"id":"n","label":"N","kind":"procedure","phasePlan":[]}"#.utf8))
    #expect(unplanned.plan == phasePlans[.procedure])
}

/// The teaching boundary: every ancestor is prior, everything else on the map
/// is somebody else's pass. `tests/conceptBoundary.test.ts` pins the same shape
/// on the web — a direct-prereqs-only answer re-teaches two columns back and
/// wanders into the next concept.
@Test func theBoundaryIsEveryAncestorAgainstEverythingElse() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "a", label: "A"), ConceptNode(id: "b", label: "B"),
            ConceptNode(id: "c", label: "C"), ConceptNode(id: "d", label: "D"),
            ConceptNode(id: "g", label: "G", gap: true),
        ],
        edges: [ConceptEdge("a", "b"), ConceptEdge("b", "c"), ConceptEdge("c", "g", dashed: true)]
    )
    let boundary = graph.boundary(of: "c")
    // "a" is two hops back and still prior — the direct-prereq answer missed it.
    #expect(boundary.prior == ["A", "B"])
    // "d" is on nobody's path to "c" and belongs to its own pass; the gap node
    // is in neither list, or two learners on this topic stop sharing a cache row.
    #expect(boundary.later == ["D"])
    #expect(graph.boundary(of: "a").prior.isEmpty)
    #expect(graph.boundary(of: "a").later == ["B", "C", "D"])
}
