import Foundation
import Testing
@testable import AtlasKit

/// The three promises the warm cache makes, and the app is wrong without any of
/// them: a click never pays for a generation already running; a pass that failed
/// leaves no *cache entry* for the next caller to inherit; and what already
/// landed stays readable, because those are the sections on the learner's
/// screen.

/// How many times the work behind a key was actually started.
private actor Starts {
    private(set) var count = 0
    func tick() { count += 1 }
}

/// A pass that lands in two parts, so a joiner can be caught mid-stream.
private func twoParts(_ starts: Starts) -> @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error> {
    {
        await starts.tick()
        return AsyncThrowingStream { continuation in
            continuation.yield(landed(["one"]))
            Task {
                try? await Task.sleep(for: .milliseconds(30))
                continuation.yield(landed(["one", "two"]))
                continuation.finish()
            }
        }
    }
}

/// A landed pass and the JSON behind it — the cache keeps both halves.
private func landed(_ items: [String]) -> Landed<[String]> {
    Landed(value: items, raw: .array(items.map(JSONValue.string)))
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

@MainActor
@Test func aFailedPassLeavesNothingBehind() async {
    let cache = WarmCache()
    let failure = await cache.fill("connect|x", once: {
        throw AtlasError(code: "upstream", message: "boom")
    } as @Sendable () async throws -> Landed<String>)
    #expect(failure != nil)

    // Nothing cached, and nothing in flight — so the next caller runs it again
    // rather than being handed the same error a second time.
    let nothing: String? = cache.content("connect|x")
    #expect(nothing == nil)
    #expect(await cache.fill("connect|x", once: { Landed(value: "a web", raw: .string("a web")) }) == nil)
    let landed: String? = cache.content("connect|x")
    #expect(landed == "a web")
}

@MainActor
@Test func aPassThatLandsEmptyIsAFailure() async {
    let cache = WarmCache()
    // A pass that ends without ever yielding is a failure that forgot to
    // throw, and keeping it would hand every later click an empty screen.
    let empty = await cache.fill("socratic|x", live: {
        AsyncThrowingStream { $0.finish() }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error>)
    #expect(empty != nil)
    let nothing: [String]? = cache.content("socratic|x")
    #expect(nothing == nil)
}

@MainActor
@Test func aStreamThatDiesMidPassKeepsWhatTheLearnerIsReading() async {
    let cache = WarmCache()
    // Three sections land and then the connection drops. Those three have been
    // handed to the screen and read; throwing does not take them back.
    let error = await cache.fill("consume|x", live: {
        AsyncThrowingStream { continuation in
            continuation.yield(landed(["one"]))
            continuation.yield(landed(["one", "two"]))
            continuation.finish(throwing: AtlasError(code: "transport", message: "dropped"))
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error>)
    #expect(error != nil)
    let prefix: [String]? = cache.content("consume|x")
    #expect(prefix == ["one", "two"])
    // But the key is still cold: nothing half-written is uploaded, and the
    // retry runs the generation again rather than being answered from memory.
    #expect(cache.isIncomplete("consume|x"))
    #expect(cache.raw["consume|x"] == nil)

    let retried = await cache.fill("consume|x", live: {
        AsyncThrowingStream { continuation in
            continuation.yield(landed(["one", "two", "three"]))
            continuation.finish()
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error>)
    #expect(retried == nil)
    let whole: [String]? = cache.content("consume|x")
    #expect(whole == ["one", "two", "three"])
    #expect(cache.isIncomplete("consume|x") == false)
}

@MainActor
@Test func aPartialFrameRedrawsTheScreenWithoutEverBeingCached() async {
    let cache = WarmCache()
    let gate = AsyncStream<Void>.makeStream()
    // The lens sheet's whole point: a beat with a label and no prose yet is
    // worth painting rather than sitting blank through.
    async let running: Error? = cache.fill("model|x", live: {
        AsyncThrowingStream { continuation in
            continuation.yield(Landed(value: ["draft"], raw: .null, partial: true))
            Task {
                for await _ in gate.stream { break }
                continuation.yield(landed(["beat one"]))
                continuation.finish()
            }
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error>)

    // Polled, not a fixed beat: this test shares the main actor with every
    // other one in the suite, and a 40 ms sleep was really a bet on how busy
    // that actor happened to be.
    var drawn: [String]?
    for _ in 0..<200 where drawn == nil {
        try? await Task.sleep(for: .milliseconds(10))
        drawn = cache.content("model|x")
    }
    #expect(drawn == ["draft"])
    // Painted, never filed: a half-written beat must not be uploaded to the
    // shared row, and must not be served to the next caller as a finished one.
    #expect(cache.raw["model|x"] == nil)
    #expect(cache.isIncomplete("model|x"))

    gate.continuation.yield()
    gate.continuation.finish()
    #expect(await running == nil)
    let whole: [String]? = cache.content("model|x")
    #expect(whole == ["beat one"])
    #expect(cache.raw["model|x"] != nil)
    #expect(cache.isIncomplete("model|x") == false)
}

@MainActor
@Test func aWarmThatLandsAfterAMapSwitchStaysOutOfTheNewRun() async {
    let cache = WarmCache()
    let gate = AsyncStream<Void>.makeStream()
    // A generation started for the old map is deliberately left running —
    // cancelling one that is nearly back wastes what was paid for it — so it
    // must instead be unable to file its answer into the map that replaced it.
    async let running: Error? = cache.fill("consume|x", live: {
        AsyncThrowingStream { continuation in
            Task {
                for await _ in gate.stream { break }
                continuation.yield(landed(["stale"]))
                continuation.finish()
            }
        }
    } as @Sendable () async -> AsyncThrowingStream<Landed<[String]>, Error>)

    try? await Task.sleep(for: .milliseconds(40))
    cache.clear()
    gate.continuation.yield()
    gate.continuation.finish()
    _ = await running
    let nothing: [String]? = cache.content("consume|x")
    #expect(nothing == nil)
}
