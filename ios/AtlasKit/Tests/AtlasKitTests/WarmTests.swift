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
