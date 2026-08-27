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
    nonisolated(unsafe) private static var requests: [(host: String, method: String, path: String)] = []

    // Keyed by host because the tests below run in parallel against the same
    // static: each one gets its own hostname and only sees its own requests.
    static func saw(_ method: String, _ path: String, host: String) -> Bool {
        lock.withLock {
            requests.contains { $0.host == host && $0.method == method && $0.path.contains(path) }
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.lock.withLock {
            Self.requests.append((request.url?.host() ?? "", request.httpMethod ?? "", path))
        }
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
    let host = URL(string: "https://atlas-debounce.test")!

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
    #expect(Stub.saw("POST", "run_states", host: host.host()!))
    // And what was written is what the dashboard now lists.
    #expect(store.maps.contains { $0.subject == "Cálculo I" })
}

/// Signing out used to *cancel* the pending save instead of flushing it: grade
/// the last card, tap Sair within two seconds, and the grade never left the
/// phone. Same shape as the bug above, one tap further along.
@MainActor
@Test func signingOutFlushesTheWorkStillInTheDebounce() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-signout.test")!

    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session)
    )
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")

    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])

    // No sleep on purpose: the debounce is still armed when Sair is tapped.
    await store.signOut()
    #expect(Stub.saw("POST", "run_states", host: host.host()!))
    #expect(store.session == nil)
    #expect(store.subject.isEmpty)
}

/// Answers auth, and refuses every `run_states` request. The two failures the
/// learner must be *told* about rather than left to guess at.
private final class Offline: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let broken = request.url?.path.contains("run_states") ?? false
        let response = HTTPURLResponse(
            url: request.url!, statusCode: broken ? 500 : 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        let body = broken
            ? #"{"message":"upstream"}"#
            : #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// The two failures that used to be silent. A library that will not load looked
/// exactly like an account with no maps — which put the learner in front of the
/// map builder, where rebuilding the same subject upserts an empty snapshot over
/// the row they still had. And a save that never landed looked exactly like one
/// that did until the next launch.
@MainActor
@Test func aFailedFetchAndAFailedSaveAreBothHeld() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Offline.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-offline.test")!

    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session)
    )
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")

    // Not "no maps": "we could not ask".
    #expect(store.libraryFailed)
    #expect(store.library.isEmpty)

    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])
    await store.saveNow()
    #expect(store.saveFailed)
}

/// Answers the first upsert with a 401 and everything after it with a 200 — an
/// access token that expired mid-run, which is what an hour of work looks like
/// from the server's side.
private final class Expired: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var upserts = 0
    nonisolated(unsafe) private static var refreshes = 0

    static var counts: (upserts: Int, refreshes: Int) {
        lock.withLock { (upserts, refreshes) }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let isUpsert = path.contains("run_states") && request.httpMethod == "POST"
        let status = Self.lock.withLock { () -> Int in
            if request.url?.query()?.contains("refresh_token") == true { Self.refreshes += 1 }
            guard isUpsert else { return 200 }
            Self.upserts += 1
            return Self.upserts == 1 ? 401 : 200
        }
        let body: String = if path.contains("run_states") {
            status == 401 ? #"{"message":"JWT expired"}"# : "[]"
        } else {
            #"{"access_token":"fresh","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#
        }
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// The token used to be refreshed at launch and never again: work past the hour
/// mark 401'd, `try?` swallowed it, and the learner watched a perfectly healthy
/// app persist nothing until the next launch threw the session away.
@MainActor
@Test func anExpiredTokenIsRenewedAndTheSaveRetried() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Expired.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-expired.test")!

    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session)
    )
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")

    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])
    await store.saveNow()

    #expect(!store.saveFailed)
    #expect(Expired.counts.upserts == 2)
    #expect(Expired.counts.refreshes >= 1)
    #expect(store.session?.accessToken == "fresh")
}
