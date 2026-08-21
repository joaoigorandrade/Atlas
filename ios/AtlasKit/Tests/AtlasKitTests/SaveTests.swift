import Foundation
import Testing
@testable import AtlasKit

/// The debounced save, end to end against a fake server.
///
/// It gets the one test with a URL stub in it because it is the only write in
/// the app nobody watches happen: a run that never reaches Postgres looks
/// exactly like one that did until the next launch, and then a week of work is
/// simply gone. The bug this pins is precisely that shape — the flush used to
/// cancel the very task it was running inside, which cancelled the upsert it
/// had just started.

/// Answers auth and `run_states` with the smallest bodies each decoder accepts,
/// and records the requests it was asked for.
private final class Stub: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var requests: [(method: String, path: String)] = []

    static func reset() {
        lock.withLock { requests = [] }
    }

    static func saw(_ method: String, _ path: String) -> Bool {
        lock.withLock { requests.contains { $0.method == method && $0.path.contains(path) } }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.lock.withLock { Self.requests.append((request.httpMethod ?? "", path)) }
        let body: String = if path.contains("run_states") {
            "[]"
        } else {
            #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#
        }
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor
@Test func aChangeToTheRunReachesTheServerOnItsOwn() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas.test")!
    Stub.reset()

    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session)
    )
    // Nothing is saved until the store knows it is being written by a learner
    // rather than filled in — `restore` is what ends that quiet.
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")

    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])

    // Nobody calls `saveNow` here on purpose: the debounce is the whole subject.
    try await Task.sleep(for: .seconds(3))
    #expect(Stub.saw("POST", "run_states"))
    // And what was written is what the dashboard now lists.
    #expect(store.maps.contains { $0.subject == "Cálculo I" })
}
