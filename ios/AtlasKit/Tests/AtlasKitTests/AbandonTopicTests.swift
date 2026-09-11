import Foundation
import Networking
import Testing
@testable import AtlasKit

/// Onboarding opens the topic before the map is generated and deletes it again
/// when the build produces nothing. Creating a topic is an upsert on
/// `(user_id, subject)`, so re-running onboarding on a subject the learner
/// already has hands back *their* topic — and deleting that one cascades away
/// its map, mastery states, card deck and every generated payload, on the
/// server and in the device mirror alike.
///
/// `created` is the server's answer to "did this call make the row?", and it is
/// the only thing standing between a failed build and the learner's work.

private let topicId = "22222222-2222-4222-8222-222222222222"

private func topicJSON(created: Bool?) -> String {
    let flag = created.map { ",\"created\":\($0)" } ?? ""
    return """
    {"id":"\(topicId)","subject":"Cálculo I","goal":"exam","interests":"",
     "paretoPct":20,"examDate":"","updatedAt":"2026-09-01T10:00:00.000Z",
     "calibSamples":[],"litToday":[],"graph":{"nodes":[],"edges":[]},
     "states":{},"positions":{},"shakyReasons":{},"reviewedNodes":[],
     "consumeProgress":{},"cards":[]\(flag)}
    """
}

private let profileJSON = """
{"dailyTarget":15,"language":null,
 "adherence":{"streak":0,"best":0,"freezes":0,"lastDay":"","metToday":false,
              "usualTime":"","reminderOn":false}}
"""

private let sessionJSON =
    #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"email":"a@b.c"}}"#

private final class Stub: URLProtocol, @unchecked Sendable {
    /// What the server says about the row it just handed back. Nil is an older
    /// server that does not say at all.
    nonisolated(unsafe) static var created: Bool?
    nonisolated(unsafe) static var deletes: [String] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        if request.httpMethod == "DELETE" { Self.deletes.append(path) }
        let body: String = if path.hasSuffix("/api/v1/bootstrap") {
            #"{"profile":\#(profileJSON),"topics":[]}"#
        } else if path.hasSuffix("/api/v1/topics"), request.httpMethod == "POST" {
            topicJSON(created: Self.created)
        } else if path.contains("/api/v1/") {
            #"{"ok":true}"#
        } else {
            sessionJSON
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
private func building(created: Bool?) async throws -> AtlasStore {
    Stub.created = created
    Stub.deletes = []
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://abandon.test")!
    let store = AtlasStore(
        api: AtlasAPI(baseURL: host, session: session),
        auth: AtlasAuth(baseURL: host, session: session),
        runs: RunStore(baseURL: host, session: session),
        local: LocalStore(inMemory: true)
    )
    await store.restore()
    try await store.signIn(email: "a@b.c", password: "secret")
    var form = OnboardingForm()
    form.topic = "Cálculo I"
    await store.createTopic(form)
    return store
}

/// Serialized: the three cases share one stub, and the answer it gives is the
/// whole subject of the test.
@Suite(.serialized)
struct AbandonTopicTests {
    @MainActor
    @Test func abandoningDeletesTheTopicThisBuildCreated() async throws {
        let store = try await building(created: true)
        #expect(store.topicId == topicId)
        await store.abandonTopic()
        #expect(Stub.deletes.contains { $0.hasSuffix("/api/v1/topics/\(topicId)") })
        #expect(store.library.isEmpty)
    }

    @MainActor
    @Test func abandoningLeavesTheLearnersExistingMapAlone() async throws {
        // The upsert adopted a topic that already had a map, mastery and cards.
        // A build that then failed used to cascade all of it away.
        let store = try await building(created: false)
        #expect(store.topicId == topicId)
        await store.abandonTopic()
        #expect(Stub.deletes.isEmpty)
        #expect(store.library.map(\.id) == [topicId])
    }

    @MainActor
    @Test func aServerThatDoesNotSayIsNeverTakenAsPermissionToDelete() async throws {
        let store = try await building(created: nil)
        await store.abandonTopic()
        #expect(Stub.deletes.isEmpty)
    }
}
