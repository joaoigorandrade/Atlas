import Foundation
import Networking
import Testing
@testable import AtlasKit

/// The debounced write, end to end against a fake server.
///
/// It gets the tests with a URL stub in them because it is the only write in
/// the app nobody watches happen: a run that never reaches the server looks
/// exactly like one that did until the next launch, and then a week of work is
/// simply gone. The bugs pinned here are all that shape — a flush that
/// cancelled the task it was running inside, a sign-out that dropped the
/// debounce, an expired token swallowed by `try?`.
///
/// What changed under them: writes are deltas now, over `/api/v1`, and the
/// map is a set of node rows rather than a snapshot column. The failures are
/// the same ones.

private let topicId = "11111111-1111-4111-8111-111111111111"

/// The smallest topic each decoder accepts.
private func topicJSON(subject: String) -> String {
    """
    {"id":"\(topicId)","subject":"\(subject)","goal":"exam","interests":"",
     "paretoPct":20,"examDate":"","updatedAt":"2026-09-01T10:00:00.000Z",
     "calibSamples":[],"litToday":[],"graph":{"nodes":[],"edges":[]},
     "states":{},"positions":{},"shakyReasons":{},"reviewedNodes":[],
     "consumeProgress":{},"cards":[]}
    """
}

private let profileJSON = """
{"dailyTarget":15,"language":null,
 "adherence":{"streak":0,"best":0,"freezes":0,"lastDay":"","metToday":false,
              "usualTime":"","reminderOn":false}}
"""

private let sessionJSON =
    #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#

/// The body each route answers with. Shared by every stub below so they differ
/// only in the failure they are staged to produce.
private func stubBody(for path: String, subject: String = "Cálculo I") -> String {
    if path.hasSuffix("/api/v1/bootstrap") { return #"{"profile":\#(profileJSON),"topics":[]}"# }
    if path.hasSuffix("/api/v1/topics") { return topicJSON(subject: subject) }
    if path.contains("/api/v1/") { return #"{"ok":true}"# }
    return sessionJSON
}

@MainActor
private func store(host: URL, session: URLSession) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session),
        // In memory: the mirror is a file in Application Support, and a suite
        // that shared one would have each case opening the maps the last one
        // left behind.
        local: LocalStore(inMemory: true)
    )
}

/// Answers auth and `/api/v1` with the smallest bodies each decoder accepts,
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
        respond(200, stubBody(for: path))
    }

    override func stopLoading() {}
}

extension URLProtocol {
    fileprivate func respond(_ status: Int, _ body: String) {
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// A signed-in store with a topic open — what every case below starts from.
@MainActor
private func opened(_ host: URL, _ session: URLSession) async throws -> AtlasStore {
    let store = store(host: host, session: session)
    // Nothing is saved until the store knows it is being written by a learner
    // rather than filled in — `restore` is what ends that quiet.
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")
    var form = OnboardingForm()
    form.topic = "Cálculo I"
    await store.createTopic(form)
    return store
}

@MainActor
@Test func aChangeToTheRunReachesTheServerOnItsOwn() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-debounce.test")!

    let store = try await opened(host, session)
    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])

    // Nobody calls `saveNow` here on purpose: the debounce is the whole subject.
    try await Task.sleep(for: .seconds(3))
    #expect(Stub.saw("PATCH", "/api/v1/topics/\(topicId)/nodes", host: host.host()!))
    #expect(store.maps.contains { $0.subject == "Cálculo I" })
}

/// Signing out used to *cancel* the pending save instead of flushing it: grade
/// the last card, tap Sair within two seconds, and the grade never left the
/// phone.
@MainActor
@Test func signingOutFlushesTheWorkStillInTheDebounce() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-signout.test")!

    let store = try await opened(host, session)
    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])

    // No sleep: the write is still sitting in the debounce when this is tapped.
    await store.signOut()
    #expect(Stub.saw("PATCH", "/api/v1/topics/\(topicId)/nodes", host: host.host()!))
    #expect(store.session == nil)
    #expect(store.subject.isEmpty)
}

/// Excluding a topic. The row has to actually go — a delete that only cleared
/// the screen would put the map back on the dashboard at the next launch — and
/// the debounce armed by the work that came before it must not recreate it.
@MainActor
@Test func excludingATopicDeletesItAndClearsTheRunItWasOpen() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-exclude.test")!

    let store = try await opened(host, session)
    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])
    await store.saveNow()
    #expect(store.maps.contains { $0.subject == "Cálculo I" })

    // No sleep, again: the graph change above is still in the debounce.
    try await store.deleteMap(topicId)
    #expect(Stub.saw("DELETE", "/api/v1/topics/\(topicId)", host: host.host()!))
    #expect(store.maps.isEmpty)
    // It was the open map, and the only one — an empty run is what routes the
    // shell back to onboarding.
    #expect(store.subject.isEmpty)
    #expect(store.graph.nodes.isEmpty)
}

/// Answers auth, and refuses every `/api/v1` request. The two failures the
/// learner must be *told* about rather than left to guess at.
private final class Offline: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let broken = request.url?.path.contains("/api/v1/") ?? false
        respond(broken ? 500 : 200, broken ? #"{"code":"upstream"}"# : sessionJSON)
    }

    override func stopLoading() {}
}

/// The two failures that used to be silent. A library that will not load looked
/// exactly like an account with no maps — which put the learner in front of the
/// map builder, where rebuilding the same subject overwrote the run they still
/// had. And a save that never landed looked exactly like one that did until the
/// next launch.
@MainActor
@Test func aFailedFetchAndAFailedSaveAreBothHeld() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Offline.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-offline.test")!

    let store = store(host: host, session: session)
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")

    // Not "no maps": "we could not ask". And with nothing on disk either, that
    // is a failure the learner has to be shown.
    #expect(store.libraryFailed)
    #expect(store.library.isEmpty)

    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])
    await store.saveNow()
    #expect(store.saveFailed)
}

/// Answers the first node write with a 401 and everything after it with a 200 —
/// an access token that expired mid-run, which is what an hour of work looks
/// like from the server's side.
private final class Expired: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var writes = 0
    nonisolated(unsafe) private static var refreshes = 0

    static var counts: (writes: Int, refreshes: Int) { lock.withLock { (writes, refreshes) } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let isWrite = path.contains("/nodes") && request.httpMethod == "PATCH"
        let status = Self.lock.withLock { () -> Int in
            if request.url?.query()?.contains("refresh_token") == true { Self.refreshes += 1 }
            guard isWrite else { return 200 }
            Self.writes += 1
            return Self.writes == 1 ? 401 : 200
        }
        // The renewed session carries a different token, which is how the test
        // below can tell a real refresh from a swallowed failure.
        let renewed =
            #"{"access_token":"fresh","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#
        let body =
            if status == 401 { #"{"code":"auth"}"# }
            else if path.contains("/api/v1/") { stubBody(for: path) }
            else { renewed }
        respond(status, body)
    }

    override func stopLoading() {}
}

/// The token used to be refreshed at launch and never again: work past the hour
/// mark 401'd, `try?` swallowed it, and the learner watched a perfectly healthy
/// app persist nothing until the next launch threw the session away.
@MainActor
@Test func anExpiredTokenIsRenewedAndTheWriteRetried() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Expired.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-expired.test")!

    let store = try await opened(host, session)
    store.subject = "Cálculo I"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")])
    await store.saveNow()

    // The first write 401s, the token is renewed, and the retry the failure
    // arms lands the work — rather than it sitting on the phone all afternoon.
    #expect(Expired.counts.refreshes >= 1)
    #expect(store.session?.accessToken == "fresh")
    try await Task.sleep(for: .seconds(16))
    #expect(Expired.counts.writes >= 2)
    #expect(!store.saveFailed)
}
