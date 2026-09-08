import Foundation
import Testing
@testable import AtlasKit

/// The Socratic pass's own rules: how long a pass runs, what it earned, where
/// that sends the learner, and what survives leaving the screen. Everything
/// else on screen 15 is layout; these are what lie to the learner if they drift.

@MainActor private func store(gap: Bool = false) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(
            nodes: [
                ConceptNode(id: "lat", label: "Limites laterais", gap: gap ? true : nil),
            ],
            edges: []
        ),
        states: ["lat": .frontier],
        subject: "Cálculo I"
    )
}

/// One written probe, the way a step arrives from the topic's content.
private func probe(_ id: String, spare: Bool = false) -> JSONValue {
    .object([
        "id": .string(id),
        "move": .string("Clarify"),
        "prompt": .string("O que muda quando o lado muda?"),
        "replies": .array([]),
        "hint": .string("Pense em cada lado separadamente."),
        "tell": .string("O limite lateral olha um lado por vez."),
        "spare": .bool(spare),
    ])
}

@MainActor private func script(_ store: AtlasStore, _ steps: [JSONValue]) {
    store.seedWarm([
        RunStore.ContentItem(nodeId: "lat", kind: "socratic", variant: "", payload: .array(steps))
    ])
}

@MainActor private func pass(_ store: AtlasStore) -> (SessionViewModel, SocraticViewModel) {
    let session = SessionViewModel(node: store.graph.nodes[0], store: store)
    return (session, SocraticViewModel(session: session, api: store.api))
}

@MainActor
@Test func aStreamingPassPlansOnTheEstimateRatherThanOnTheProbesItHolds() {
    let store = store()
    // The script streams one probe at a time, so the array in hand is a
    // prefix. Reading the plan off it ended the whole pass after one question.
    script(store, [probe("s1")])
    let (_, model) = pass(store)
    model.landed()
    #expect(model.log.count == 1)
    model.tell()
    #expect(!model.done)
    #expect(model.awaiting)
}

@MainActor
@Test func aPassThatIsAllHereRunsExactlyItsCoreProbes() async {
    let store = store()
    script(store, [probe("s1"), probe("s2"), probe("s3", spare: true)])
    let (_, model) = pass(store)
    await model.load()
    // Two core probes and a spare nobody bought.
    model.tell()
    #expect(!model.done)
    model.tell()
    #expect(model.done)
}

@Test func whatAPassEarnedIsNotSimplyThatItEnded() {
    #expect(socraticOutcome([.unaided, .unaided], gap: false) == .unaided)
    #expect(socraticOutcome([.unaided, .hint], gap: false) == .assisted)
    #expect(socraticOutcome([.told, .told], gap: false) == .flagged)
    // A gap closes only on a clean reconstruction — a hint still counts, being
    // told outright does not.
    #expect(socraticOutcome([.unaided, .hint], gap: true) == .unaided)
    #expect(socraticOutcome([.told], gap: true) == .flagged)
}

@MainActor
@Test func aPassToldThroughHandsBackIntoTheReadingWithAGapUnderTheNode() async {
    let store = store()
    script(store, [probe("s1"), probe("s2")])
    let (session, model) = pass(store)
    await model.load()
    model.tell()
    model.tell()
    #expect(model.outcome == .flagged)
    model.advance()
    // Not the teach-back: the reading didn't land, so the hand-off runs
    // backwards, and the map carries the reason.
    #expect(session.phase == .consume)
    #expect(store.states["gap-soc-lat"] == .gap)
    #expect(store.reading("lat")?.handedOff == false)
}

@MainActor
@Test func aGapReconstructedUnaidedLeavesTheMap() async {
    let store = store(gap: true)
    script(store, [probe("s1")])
    let (session, model) = pass(store)
    await model.load()
    #expect(model.gapPass)
    // One probe, closed unaided: `close` is reached through the judge on a real
    // pass, and the outcome is what the CTA settles on.
    session.settleSocratic(.unaided)
    #expect(!store.graph.nodes.contains { $0.id == "lat" })
    #expect(session.finished)
}

@MainActor
@Test func aPassLeftHalfAnsweredComesBackWithItsTranscript() async {
    let store = store()
    script(store, [probe("s1"), probe("s2")])
    let (_, model) = pass(store)
    await model.load()
    model.stuck()
    #expect(model.help == 2)
    #expect(store.savedPass("lat")?.log.count == 3)

    // A second entry on the same node is the learner coming back to it.
    let (_, resumed) = pass(store)
    await resumed.load()
    #expect(resumed.log.count == 3)
    #expect(resumed.help == 2)

    // …and a pass that ended has nothing left to resume.
    resumed.tell()
    resumed.tell()
    #expect(resumed.done)
    #expect(store.savedPass("lat") == nil)
}

@Test func aMisconceptionEarnsItsNameOnTheRepeat() {
    var list = recordMisconception([], "confunde limite com valor", node: "Limites")
    #expect(recurringMisconceptions(list).isEmpty)
    // The same idea again — case and whitespace are not a second entry.
    list = recordMisconception(list, "  Confunde limite com valor  ", node: "Continuidade")
    #expect(list.count == 1)
    #expect(list[0].count == 2)
    #expect(list[0].node == "Continuidade")
    #expect(recurringMisconceptions(list).count == 1)
}
