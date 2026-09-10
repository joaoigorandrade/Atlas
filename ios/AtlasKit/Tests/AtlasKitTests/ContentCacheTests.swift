import Foundation
import Testing
@testable import AtlasKit

/// Generated content belongs to the topic, and the server writes it the moment
/// it generates it — one row per payload, addressed by node, kind and variant.
///
/// What this pins is the read: a payload written by either client opens here
/// without a generation, and it opens under the key this client would have
/// generated it under. The other half of the old round trip is gone — nothing
/// is uploaded any more, so there is no merge left to get wrong.

private let node = ConceptNode(id: "lat", label: "Limites laterais")

/// A reading pass as the model writes it — including the two fields this client
/// has no property for, which is what the store holds it as JSON for.
private let sectionJSON = JSONValue.object([
    "id": .string("c1"),
    "kicker": .string("1 · O que é"),
    "body": .array([.string("Um limite lateral é…")]),
    "takeaway": .string("Aproxime-se de um lado só."),
    "terms": .array([.object(["term": .string("limite"), "gloss": .string("valor de chegada")])]),
    "ask": .string("Pergunte sobre esta passagem"),
])

/// An elaboration as the server sends it — the shape the screen renders, with
/// the generator's `{content: …}` envelope already taken off by `renderShape`.
private let webJSON = JSONValue.object([
    "centerId": .string("lat"),
    "centerLabel": .string("Limites laterais"),
    "detectNote": .string("conceitual"),
    "center": .object(["x": .number(0), "y": .number(0)]),
    "cands": .array([]),
])

private let beatsJSON = JSONValue.array([
    .object(["label": .string("Passo 1"), "text": .string("Comece pelo lado direito.")]),
])

private func item(
    _ kind: String, node nodeId: String = "lat", variant: String = "", payload: JSONValue
) -> RunStore.ContentItem {
    RunStore.ContentItem(nodeId: nodeId, kind: kind, variant: variant, payload: payload)
}

@MainActor
private func store() -> AtlasStore {
    let host = URL(string: "https://atlas.test")!
    return AtlasStore(
        api: AtlasAPI(baseURL: host), auth: AtlasAuth(baseURL: host),
        graph: ConceptGraph(nodes: [node]), subject: "Cálculo I"
    )
}

@MainActor
@Test func aPassGeneratedAnywhereOpensHereWithoutAGeneration() {
    let store = store()
    store.seedWarm([item("consume", payload: .array([sectionJSON]))])
    #expect(store.chunks(node).map(\.id) == ["c1"])
}

@MainActor
@Test func aPassIsAddressedByItsRow_notByStateThatMoves() {
    // The address is the row's own — node, kind, variant — so nothing about
    // the learner's progress can re-address content the topic already owns.
    // Connect used to be keyed on the pool of concepts they had learned, so
    // mastering *any* other node re-addressed every web and regenerated it.
    let store = store()
    store.seedWarm([item("connect", payload: webJSON)])
    #expect(store.web(node) != nil)

    store.states["other"] = .mastered
    #expect(store.web(node) != nil)
}

@MainActor
@Test func aRedoOfTheCrucibleIsItsOwnRow_notAnOverwrite() {
    // A redo asks for a problem in a different domain: re-serving the one the
    // learner solved measures recall, which is what this phase exists not to
    // measure. So it is content in its own right, at its own variant.
    let store = store()
    #expect(store.crucibleVariant(node) == "")
    store.bumpCrucibleRerun(node.id)
    #expect(store.crucibleVariant(node) == "r1")
    #expect(store.address("crucible", node, variant: "r1") == "lat|crucible|r1")
}

@MainActor
@Test func bothClientsSpellAnAddressTheSameWay() {
    // `nodeId|kind|variant` — the `node_content` row's own address, and the
    // whole of what makes a pass written in the browser open here without a
    // generation. See docs/CONTENT-STORAGE.md.
    let store = store()
    #expect(store.address("consume", node) == "lat|consume|")
    #expect(store.address("model", node, variant: "c1:analogy") == "lat|model|c1:analogy")
}

@MainActor
@Test func aLensOpensUnderItsOwnAddressWithinTheNode() {
    let store = store()
    let chunk = try! sectionJSON.decode(ConsumeChunk.self)
    // `variant` is the server's own address for a walkthrough: one section, one
    // lens. Two lenses over the same section are two payloads, and both are
    // kept.
    store.seedWarm([item("model", variant: "c1:analogy", payload: beatsJSON)])
    #expect(store.lens(node, chunk, .analogy).map(\.label) == ["Passo 1"])
    #expect(store.lens(node, chunk, .deeper).isEmpty)
}

@MainActor
@Test func contentForANodeThisMapDoesNotHaveIsIgnored() {
    // A payload arriving for a node that is not on the map — a re-planned gap
    // this client has not seen yet — is dropped rather than filed under a key
    // nothing will ever ask for.
    let store = store()
    store.seedWarm([item("consume", node: "der", payload: .array([sectionJSON]))])
    #expect(store.chunks(node).isEmpty)
}

@MainActor
@Test func aTruncatedPassIsAdoptedAsAPrefix_notAsAFinishedOne() {
    // A pass whose stream died is kept so the learner keeps their place, but it
    // is marked incomplete: it must show the retry rather than reading as a
    // one-section concept.
    let store = store()
    store.seedWarm([item("consume", payload: .array([sectionJSON]))])
    #expect(store.warm.isIncomplete(store.address("consume", node)))
}
