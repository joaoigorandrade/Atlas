import Foundation
import Networking
import Testing
@testable import AtlasKit

/// The build's `POST /topics` is one request on a phone, and losing it used to
/// lose the whole map: the run kept working with no `topicId`, every save after
/// it was a silent no-op, and "Seus mapas" — which lists `library` — never
/// heard of the map until the next launch read the row back from the server.

private let topicId = "11111111-1111-4111-8111-111111111111"

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

/// Drops the first `POST /topics` the way a phone in a lift does, and answers
/// every later one — the upsert on `(user_id, subject)` makes that the same row.
private final class Stub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var creates = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        if path.hasSuffix("/api/v1/topics"), request.httpMethod == "POST" {
            Self.creates += 1
            if Self.creates == 1 {
                client?.urlProtocol(self, didFailWithError: URLError(.timedOut))
                return
            }
        }
        let body: String = if path.hasSuffix("/api/v1/bootstrap") {
            #"{"profile":\#(profileJSON),"topics":[]}"#
        } else if path.hasSuffix("/api/v1/topics") {
            topicJSON(subject: "Cálculo I")
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
@Test func aMapWhoseCreateWasLostStillReachesTheServerAndTheDashboard() async throws {
    Stub.creates = 0
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = URLSession(configuration: config)
    let host = URL(string: "https://lostcreate.test")!
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
    // The create was lost: the run has no row, which is where the old bug began.
    #expect(store.topicId == nil)
    #expect(store.library.isEmpty)

    // What `finish()` writes. The save behind it has to make the row.
    store.subject = "Cálculo I"
    await store.saveNow()

    #expect(store.topicId != nil)
    #expect(store.maps.map(\.subject) == ["Cálculo I"])
    #expect(!store.saveFailed)
}
