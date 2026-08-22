import Foundation
import Testing
@testable import AtlasKit

/// The two promises the warm cache makes, and the app is wrong without either:
/// a click never pays for a generation already running, and a pass that failed
/// leaves nothing behind for the next caller to inherit.

/// How many times the work behind a key was actually started.
private actor Starts {
    private(set) var count = 0
    func tick() { count += 1 }
}

/// A pass that lands in two parts, so a joiner can be caught mid-stream.
private func twoParts(_ starts: Starts) -> @Sendable () async -> AsyncThrowingStream<[String], Error> {
    {
        await starts.tick()
        return AsyncThrowingStream { continuation in
            continuation.yield(["one"])
            Task {
                try? await Task.sleep(for: .milliseconds(30))
                continuation.yield(["one", "two"])
                continuation.finish()
            }
        }
    }
}

@MainActor
@Test func aClickJoinsAWarmInsteadOfPayingForASecondGeneration() async {
    let cache = WarmCache()
    let starts = Starts()
    let live = twoParts(starts)

    async let warm: Error? = cache.fill("consume|x", live: live)
    async let click: Error? = cache.fill("consume|x", live: live)
    #expect(await warm == nil)
    #expect(await click == nil)

    #expect(await starts.count == 1)
    let landed: [String]? = cache.content("consume|x")
    #expect(landed == ["one", "two"])

    // And a third caller, after it landed, is answered from memory.
    #expect(await cache.fill("consume|x", live: live) == nil)
    #expect(await starts.count == 1)
}

/// A section, decoded the way one actually arrives — the shape has no
/// initialiser of its own.
private func section(_ id: String) throws -> ConsumeChunk {
    let json = """
    {"id":"\(id)","kicker":"1 · O que é","body":["A prosa desta seção."],
     "takeaway":"A frase para levar."}
    """
    return try JSONDecoder().decode(ConsumeChunk.self, from: Data(json.utf8))
}

@MainActor
@Test func aLensIsKeptForTheNextOpenRatherThanWrittenAgain() async throws {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [ConceptNode(id: "cadeia", label: "Regra da cadeia")]),
        subject: "Cálculo I"
    )
    let node = store.graph.nodes[0]
    let first = try section("c1")
    let second = try section("c2")

    // The section and the lens both address the beats: the same lens over the
    // next section is a different view, and so is another lens over this one.
    #expect(store.modelKey(node, first, .simpler) != store.modelKey(node, second, .simpler))
    #expect(store.modelKey(node, first, .simpler) != store.modelKey(node, first, .analogy))

    await store.warm.fill(store.modelKey(node, first, .simpler), live: {
        AsyncThrowingStream { continuation in
            continuation.yield([ConsumeModelBeat(label: "Passo 1", text: "Mais devagar.")])
            continuation.finish()
        }
    } as @Sendable () async -> AsyncThrowingStream<[ConsumeModelBeat], Error>)

    // Closing the sheet and tapping the same control again is a read — that is
    // what stops the view being rewritten in front of the learner…
    #expect(store.modelBeats(node, first, .simpler).count == 1)
    // …and nothing written for one section is ever served for another.
    #expect(store.modelBeats(node, second, .simpler).isEmpty)
}

@MainActor
@Test func aFailedPassLeavesNothingBehind() async {
    let cache = WarmCache()
    let failure = await cache.fill("connect|x", once: { throw AtlasError(code: "upstream", message: "boom") })
    #expect(failure != nil)

    // Nothing cached, and nothing in flight — so the next caller runs it again
    // rather than being handed the same error a second time.
    let nothing: String? = cache.content("connect|x")
    #expect(nothing == nil)
    #expect(await cache.fill("connect|x", once: { "a web" }) == nil)
    let landed: String? = cache.content("connect|x")
    #expect(landed == "a web")
}

@MainActor
@Test func aPassThatLandsEmptyIsAFailure() async {
    let cache = WarmCache()
    // Half-written content is never kept either: the stream below yields a
    // section and then throws, which is what a dropped connection looks like.
    let error = await cache.fill("consume|x", live: {
        AsyncThrowingStream { continuation in
            continuation.yield(["one"])
            continuation.finish(throwing: AtlasError(code: "transport", message: "dropped"))
        }
    } as @Sendable () async -> AsyncThrowingStream<[String], Error>)
    #expect(error != nil)
    let nothing: [String]? = cache.content("consume|x")
    #expect(nothing == nil)

    // A pass that ends without ever yielding is the same thing: a failure that
    // forgot to throw, and keeping it would hand every later click an empty
    // screen.
    let empty = await cache.fill("socratic|x", live: {
        AsyncThrowingStream { $0.finish() }
    } as @Sendable () async -> AsyncThrowingStream<[String], Error>)
    #expect(empty != nil)
}
