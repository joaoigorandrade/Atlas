import Foundation
import Testing
@testable import AtlasKit

/// Two writes that looked like they worked and did not, both found by driving
/// the app against production.
///
/// One phone held a map at 82% — nine concepts mastered, ten cards in rotation
/// — addressed to a topic row the server had never heard of, and had been
/// re-sending it to that dead id every fifteen seconds for hours. The other
/// stored every map built on a phone with `domain = null` beside a `phase_plan`
/// naming `provenance` and `steelman`: a row that disagrees with itself.

private let firstTopic = "11111111-1111-4111-8111-111111111111"
private let secondTopic = "22222222-2222-4222-8222-222222222222"

private let profileJSON = """
{"dailyTarget":15,"language":null,
 "adherence":{"streak":0,"best":0,"freezes":0,"lastDay":"","metToday":false,
              "usualTime":"","reminderOn":false}}
"""

private func topicJSON(_ id: String) -> String {
    """
    {"id":"\(id)","subject":"Concílio de Niceia","goal":"mastery","interests":"",
     "paretoPct":20,"examDate":"","updatedAt":"2026-09-01T10:00:00.000Z",
     "calibSamples":[],"litToday":[],"graph":{"nodes":[],"edges":[]},
     "states":{},"positions":{},"shakyReasons":{},"reviewedNodes":[],
     "consumeProgress":{},"cards":[]}
    """
}

/// Answers like the real server, and stages the one failure each case is about.
/// Keyed by host so the cases can run in parallel against the same statics.
private final class StaleStub: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var topicsMade: [String: Int] = [:]
    nonisolated(unsafe) private static var bodies: [String: [String]] = [:]

    static func bodiesSeen(host: String) -> [String] {
        lock.withLock { bodies[host] ?? [] }
    }

    static func topicsMade(host: String) -> Int {
        lock.withLock { topicsMade[host] ?? 0 }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let host = request.url?.host() ?? ""
        let method = request.httpMethod ?? ""

        // `URLSession` hands a body over as a stream once `URLProtocol` has it.
        var body = ""
        if let data = request.httpBody {
            body = String(decoding: data, as: UTF8.self)
        } else if let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 64 * 1024)
            var read = Data()
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                read.append(contentsOf: buffer[0..<n])
            }
            stream.close()
            body = String(decoding: read, as: UTF8.self)
        }
        Self.lock.withLock { Self.bodies[host, default: []].append("\(method) \(path) \(body)") }

        if path.hasSuffix("/api/v1/bootstrap") {
            return respond(200, #"{"profile":\#(profileJSON),"topics":[]}"#)
        }
        if path.hasSuffix("/api/v1/topics"), method == "POST" {
            let made = Self.lock.withLock { () -> Int in
                Self.topicsMade[host, default: 0] += 1
                return Self.topicsMade[host]!
            }
            return respond(201, topicJSON(made == 1 ? firstTopic : secondTopic))
        }
        // The row this run is addressed to is gone — deleted from another
        // device, or a create that half-landed. The second row is healthy, so a
        // store that re-creates recovers and one that trusts its cached id does
        // not.
        if path.contains(firstTopic), method != "GET" {
            return respond(404, #"{"code":"request","error":"topic not found"}"#)
        }
        if path.contains("/api/v1/") { return respond(200, #"{"ok":true}"#) }
        return respond(200, #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#)
    }

    override func stopLoading() {}

    private func respond(_ status: Int, _ body: String) {
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

@MainActor
private func opened(_ host: URL, _ session: URLSession) async throws -> AtlasStore {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session),
        local: LocalStore(inMemory: true)
    )
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")
    var form = OnboardingForm()
    form.topic = "Concílio de Niceia"
    await store.createTopic(form)
    return store
}

/// A node the client created carries what settles a claim about it, not just
/// its kind and its ladder. `ConceptNode` decodes `domain`, so the phone
/// resolved the right interpretive ladder and sent `phasePlan` — and then had
/// nowhere to put the axis, so the column went null and every later generation
/// for that node was prompted as `general` and keyed to the pre-axis cache row.
@MainActor
@Test func aNodeTakesItsDomainToTheServer() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StaleStub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-domain-delta.test")!

    let store = try await opened(host, session)
    store.subject = "Concílio de Niceia"
    store.graph = ConceptGraph(nodes: [
        ConceptNode(
            id: "estrutura-episcopal", label: "Estrutura episcopal",
            kind: .concept, domain: .interpretive,
            phasePlan: resolvePlan(.concept, .interpretive)
        )
    ])
    await store.saveNow()

    let patch = StaleStub.bodiesSeen(host: host.host()!)
        .first { $0.contains("/nodes") }
    let body = try #require(patch)
    #expect(body.contains(#""domain":"interpretive""#))
    // The two that always travelled, so this pins the axis and not the shape.
    #expect(body.contains(#""kind":"concept""#))
    #expect(body.contains("provenance"))
}

/// The retry that could never work. `ensureTopic` returned its cached id
/// unconditionally, so a 404 armed a retry that re-addressed the same dead row
/// — four times a minute, forever, with the learner's work never leaving the
/// device and the chip blaming their connection.
@MainActor
@Test func aTopicRowTheServerHasLostIsMadeAgain() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StaleStub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://atlas-stale-topic.test")!

    let store = try await opened(host, session)
    store.subject = "Concílio de Niceia"
    store.graph = ConceptGraph(nodes: [ConceptNode(id: "edito", label: "Édito de Milão")])

    // The write the dead row swallows. Standing in for the armed retry, which
    // is the same call fifteen seconds later.
    await store.saveNow()
    #expect(store.saveFailed)
    #expect(StaleStub.topicsMade(host: host.host()!) == 1)

    // What the retry does now: a fresh row, and the whole run re-sent to it.
    await store.saveNow()
    #expect(StaleStub.topicsMade(host: host.host()!) == 2)
    #expect(!store.saveFailed)
    #expect(StaleStub.bodiesSeen(host: host.host()!)
        .contains { $0.contains(secondTopic) && $0.contains("edito") })
    // And the dead row is not still sitting in the library under the live one.
    #expect(!store.maps.contains { $0.id == firstTopic })
}
