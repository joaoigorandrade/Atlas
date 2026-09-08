import Foundation
import Networking

/// The learner's data, over `/api/v1` on the web app.
///
/// This used to be PostgREST: two calls against `run_states`, with the storage
/// shape encoded here as well as in `lib/persistence.ts`. The server owns the
/// schema now, so what travels is a topic, a node delta and a card — and the
/// phone can stop knowing what a column is called.
///
/// Same host as `AtlasAPI`, so it takes its base URL rather than Supabase's.
/// Supabase is still reached directly, but for auth alone.
public actor RunStore {
    private let client: URLSessionNetworkClient

    public init(baseURL: URL, session: URLSession = .shared) {
        client = URLSessionNetworkClient(
            baseURL: baseURL,
            session: session,
            // The routes put their own `code` in the body of a 4xx, and
            // `NetworkError.httpError` would drop it — see `AtlasError`.
            successStatusCodes: 0..<600,
            logger: AtlasLog.logger
        )
    }

    /// Profile and library in one request. This is the whole first paint: every
    /// topic with its map, its mastery states and its cards. Generated content
    /// is deliberately absent — it arrives per node, behind a drawn map.
    public func bootstrap(token: String) async throws -> (AtlasProfile, [AtlasRun]) {
        struct Payload: Decodable {
            let profile: AtlasProfile
            let topics: [AtlasRun]
        }
        let payload: Payload = try await decode(RunEndpoint.bootstrap(token: token))
        return (payload.profile, payload.topics)
    }

    public func topic(_ id: String, token: String) async throws -> AtlasRun {
        try await decode(RunEndpoint.topic(id, token: token))
    }

    public func create(_ topic: JSONValue, token: String) async throws -> AtlasRun {
        try await decode(try RunEndpoint.createTopic(topic, token: token))
    }

    /// Apply a batch of node deltas, and remove the nodes that left the map.
    /// The map's only write path.
    public func patchNodes(
        _ id: String, deltas: [NodeDelta], remove: [String], token: String
    ) async throws {
        guard !deltas.isEmpty || !remove.isEmpty else { return }
        let body = JSONValue.object([
            "deltas": try JSONValue(encoding: deltas),
            "remove": .array(remove.map(JSONValue.string)),
        ])
        _ = try await send(try RunEndpoint.nodes(id, body: body, token: token))
    }

    public func patchTopic(_ id: String, body: JSONValue, token: String) async throws {
        _ = try await send(try RunEndpoint.patchTopic(id, body: body, token: token))
    }

    public func patchProfile(_ body: JSONValue, token: String) async throws {
        _ = try await send(try RunEndpoint.patchProfile(body, token: token))
    }

    /// Drop a topic. One statement on the server; the foreign keys take the
    /// map, the mastery states, the cards and every generated payload with it.
    public func delete(_ id: String, token: String) async throws {
        _ = try await send(RunEndpoint.delete(id, token: token))
    }

    /// The topic's generated content. With no nodes named this asks for
    /// everything — what a map open does once, to fill the local mirror.
    public func content(
        _ id: String, nodes: [String] = [], kinds: [String] = [], token: String
    ) async throws -> [ContentItem] {
        struct Payload: Decodable { let items: [ContentItem] }
        let payload: Payload = try await decode(
            RunEndpoint.content(id, nodes: nodes, kinds: kinds, token: token)
        )
        return payload.items
    }

    /// Today's deck, with the real interval already on every grade button.
    public func review(
        _ id: String, budgetMin: Int, language: String, token: String
    ) async throws -> RetainContent {
        try await decode(
            RunEndpoint.review(id, budgetMin: budgetMin, language: language, token: token)
        )
    }

    /// Grade one card through the real scheduler. One row, one round trip.
    ///
    /// Answers with the card as the scheduler left it — the phone carries that
    /// state without interpreting it, and it is what keeps the dashboard's
    /// "cards due" from counting a card the learner has just answered.
    public func grade(
        _ id: String, cardId: String, grade: ReviewGrade, token: String
    ) async throws -> StoredCard {
        struct Payload: Decodable { let card: StoredCard }
        let body = JSONValue.object([
            "cardId": .string(cardId), "grade": .string(grade.rawValue),
        ])
        let payload: Payload = try await decode(try RunEndpoint.grade(id, body: body, token: token))
        return payload.card
    }

    /// Cards a phase minted itself — Connect's one per confirmed link, and the
    /// deck Retain drafts.
    public func putCards(_ id: String, cards: [StoredCard], token: String) async throws {
        guard !cards.isEmpty else { return }
        let body = JSONValue.object(["cards": try JSONValue(encoding: cards)])
        _ = try await send(try RunEndpoint.putCards(id, body: body, token: token))
    }

    /// One generated payload, addressed the way a screen asks for it.
    public struct ContentItem: Decodable, Sendable {
        public let nodeId: String
        public let kind: String
        public let variant: String
        public let payload: JSONValue
    }

    private func decode<T: Decodable>(_ request: any HTTPRequest) async throws -> T {
        let response = try await send(request)
        do {
            return try JSONDecoder().decode(T.self, from: response.data)
        } catch {
            throw AtlasError(code: "upstream", message: "could not decode \(T.self): \(error)")
        }
    }

    /// Execute and classify — the one place a data request becomes an
    /// `AtlasError`.
    private func send(_ request: any HTTPRequest) async throws -> NetworkResponse {
        let response: NetworkResponse
        do {
            response = try await client.execute(request)
        } catch {
            throw AtlasError.transport(error)
        }
        guard (200..<300).contains(response.statusCode) else {
            throw AtlasError.http(response)
        }
        return response
    }
}
