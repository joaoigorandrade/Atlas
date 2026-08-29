import Foundation
import Testing
@testable import AtlasKit

/// `run_states.caches` is one column two clients write, so what this pins is the
/// round trip: a section written in the browser opens here without a
/// generation, one written here goes back in the shape the browser reads, and
/// neither client's write deletes the other's.

private let node = ConceptNode(id: "lat", label: "Limites laterais")

/// A reading pass as the model writes it — including the two fields this client
/// has no property for, which is exactly what must survive the round trip.
private let sectionJSON = JSONValue.object([
    "id": .string("c1"),
    "kicker": .string("1 · O que é"),
    "body": .array([.string("Um limite lateral é…")]),
    "takeaway": .string("Aproxime-se de um lado só."),
    "terms": .array([.object(["term": .string("limite"), "gloss": .string("valor de chegada")])]),
    "ask": .string("Pergunte sobre esta passagem"),
])

@MainActor
private func store() -> AtlasStore {
    let host = URL(string: "https://atlas.test")!
    return AtlasStore(
        api: AtlasAPI(baseURL: host), auth: AtlasAuth(baseURL: host),
        graph: ConceptGraph(nodes: [node]), subject: "Cálculo I"
    )
}

@MainActor
@Test func aPassWrittenInTheBrowserOpensHereWithoutAGeneration() {
    let store = store()
    store.seedWarm(["consume": .object(["lat": .array([sectionJSON])])])
    #expect(store.chunks(node).map(\.id) == ["c1"])
}

@MainActor
@Test func aPassWrittenHereGoesBackInTheShapeTheBrowserReads() async {
    let store = store()
    let key = store.key("consume", node)
    await store.warm.fill(key, live: {
        AsyncThrowingStream { continuation in
            continuation.yield(Landed(
                value: [try! sectionJSON.decode(ConsumeChunk.self)],
                raw: .array([sectionJSON])
            ))
            continuation.finish()
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[ConsumeChunk]>, Error>)

    // Keyed by node id under the kind, which is `RunCaches` in lib/persistence.ts.
    let row = store.cachesRow(over: ["retain": .null])
    let section = row["consume"]?.fields?["lat"]
    #expect(section == .array([sectionJSON]))

    // Stored as the model wrote it: `terms` and `ask` are rendered by the
    // browser and by nothing here, and a re-encode of the decoded half would
    // have dropped both.
    let stored = section.flatMap { try? $0.decode([JSONValue].self) }
    #expect(stored?.first?.fields?["ask"] != nil)

    // And the buckets only the browser fills are still there.
    #expect(row["retain"] == .null)
}

@MainActor
@Test func whatIsNotSharedStaysOutOfTheColumn() {
    // The Retain draft is keyed on the node set, not on one node — it has no
    // slot in the browser's shape, and its cards are already persisted as
    // `iosCards` on the snapshot.
    #expect(AtlasStore.cacheSlot("retain|Cálculo I|pt-BR|lat,der") == nil)
    #expect(AtlasStore.cacheSlot("consume|Cálculo I|lat|pt-BR|")?.key == "lat")
    // A subject with a pipe in it would file content under the wrong node.
    #expect(AtlasStore.cacheSlot("consume|a|b|lat|pt-BR|") == nil)
}

/// The lens beats are the one bucket keyed per section rather than per node.
/// They are shared all the same — `model:<nodeId>:<chunkId>:<lens>` is the
/// address `useGeneration.ts` files them under.

private let beatsJSON = JSONValue.array([
    .object(["label": .string("Passo 1"), "text": .string("Comece pelo lado direito.")]),
])

@MainActor
@Test func aLensReadInTheBrowserReopensHereWithoutAGeneration() {
    let store = store()
    let chunk = try! sectionJSON.decode(ConsumeChunk.self)
    store.seedWarm(["models": .object(["model:lat:c1:analogy": beatsJSON])])
    #expect(store.lens(node, chunk, .analogy).map(\.label) == ["Passo 1"])
    // A different lens over the same section is a different walkthrough.
    #expect(store.lens(node, chunk, .deeper).isEmpty)
}

@MainActor
@Test func aLensReadHereGoesBackUnderTheBrowsersAddress() async {
    let store = store()
    let key = store.key("model", node, AtlasStore.lensInputs("c1", .analogy))
    await store.warm.fill(key, live: {
        AsyncThrowingStream { continuation in
            continuation.yield(Landed(
                value: try! beatsJSON.decode([ConsumeModelBeat].self), raw: beatsJSON
            ))
            continuation.finish()
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[ConsumeModelBeat]>, Error>)

    let row = store.cachesRow(over: [:])
    #expect(row["models"]?.fields?["model:lat:c1:analogy"] == beatsJSON)
}
