import Foundation
import Networking

/// Every request the app makes, as a value. `HTTPRequestData` already carries a
/// path, a method, headers and a body with a fluent builder, so an endpoint here
/// is a factory function and nothing more — there is no request type per call.
enum AtlasEndpoint {
    /// `/api/generate` — the one content seam. `stream` is the server's own flag,
    /// not a transport concern, so it travels in the body like every other key.
    static func generate(_ body: [String: JSONValue], token: String?) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/generate", method: .post)
            .jsonBody(body)
            .bearer(token)
    }

    /// Read-aloud synthesis: one plain segment in, base64 audio out.
    static func speech(text: String, language: String, token: String?) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/speech", method: .post)
            .jsonBody(["text": text, "language": language])
            .bearer(token)
    }

    /// Delete the account and every row behind it. No body — the bearer is the
    /// whole request.
    static func deleteAccount(token: String?) -> HTTPRequestData {
        HTTPRequestData(path: "api/account/delete", method: .post).bearer(token)
    }
}

/// `/api/v1` on the web app — the one place learner data moves.
///
/// This used to be PostgREST: the phone read and wrote `run_states` directly,
/// which meant the storage shape was encoded here as well as in
/// `lib/persistence.ts`, and neither could change without releasing both. Now
/// the server owns the schema and this knows only a topic, a node delta and a
/// card. Supabase is still reached directly, but for auth alone.
///
/// RLS is still underneath every one of these; the bearer is still the scope.
enum RunEndpoint {
    /// Profile and library in one request — every topic with its map, its
    /// mastery states and its cards. Generated content is deliberately not in
    /// it: that arrives per node, behind an already-drawn map.
    static func bootstrap(token: String) -> HTTPRequestData {
        HTTPRequestData(path: "api/v1/bootstrap").bearer(token)
    }

    /// One topic, re-read. What "switch map" runs, so a map another device has
    /// been working on opens with that work on it.
    static func topic(_ id: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: "api/v1/topics/\(id)").bearer(token)
    }

    /// Create a topic and lay its map down. Onboarding's one write.
    static func createTopic(_ body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/topics", method: .post).jsonBody(body).bearer(token)
    }

    /// The map's only write path: what changed, and what left the map. A drag
    /// is one node's coordinates; finishing Crucible is one node's state.
    static func nodes(_ id: String, body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/topics/\(id)/nodes", method: .patch)
            .jsonBody(body).bearer(token)
    }

    /// The run-level fields: calibration, misconceptions, the exam date.
    static func patchTopic(_ id: String, body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/topics/\(id)", method: .patch)
            .jsonBody(body).bearer(token)
    }

    /// The learner's own row — the streak, the daily target, the reminders.
    /// One copy, rather than one per topic and a third in UserDefaults.
    static func patchProfile(_ body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/profile", method: .patch).jsonBody(body).bearer(token)
    }

    /// Drop a topic. One statement on the server, and the foreign keys take the
    /// map, the mastery states, the cards and every generated payload with it.
    static func delete(_ id: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: "api/v1/topics/\(id)", method: .delete).bearer(token)
    }

    /// The topic's generated content. With no nodes named this asks for
    /// everything it has — what a map open does once, to fill the local mirror.
    static func content(_ id: String, nodes: [String], kinds: [String], token: String) -> HTTPRequestData {
        var query: [String: String] = [:]
        if !nodes.isEmpty, !kinds.isEmpty {
            query["nodes"] = nodes.joined(separator: ",")
            query["kinds"] = kinds.joined(separator: ",")
        }
        return HTTPRequestData(path: "api/v1/topics/\(id)/content").query(query).bearer(token)
    }

    /// Today's deck, with the real interval already on every grade button. The
    /// scheduler runs server-side (`lib/fsrs.ts`, the same `ts-fsrs` the browser
    /// grades with), so the two clients cannot drift on a due date.
    static func review(_ id: String, budgetMin: Int, language: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: "api/v1/topics/\(id)/review")
            .query(["budgetMin": String(budgetMin), "lang": language])
            .bearer(token)
    }

    /// Grade one card. One row, one round trip — never the whole deck.
    static func grade(_ id: String, body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/topics/\(id)/review", method: .post)
            .jsonBody(body).bearer(token)
    }

    /// Cards the phases mint themselves — Connect's one card per confirmed
    /// link, and the deck Retain drafts. Scheduler state is the server's; these
    /// arrive new.
    static func putCards(_ id: String, body: JSONValue, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: "api/v1/topics/\(id)/cards", method: .put)
            .jsonBody(body).bearer(token)
    }
}

/// Supabase auth over its REST API. No SDK: three endpoints, one decode.
enum GoTrueEndpoint {
    static func token(
        _ path: String, grant: String?, redirect: String? = nil,
        _ body: [String: String], apiKey: String
    ) throws -> HTTPRequestData {
        var request = try HTTPRequestData(path: path, method: .post)
            .jsonBody(body)
            .header("apikey", apiKey)
        var query: [String: String] = [:]
        if let grant { query["grant_type"] = grant }
        // Where the confirmation email lands. GoTrue only honours it if the URL
        // is allow-listed on the project.
        if let redirect { query["redirect_to"] = redirect }
        if !query.isEmpty { request = request.query(query) }
        return request
    }
}

extension HTTPRequestData {
    /// The Supabase access token, when there is one. `/api/generate` requires a
    /// signed-in learner; native clients send it as a bearer.
    func bearer(_ token: String?) -> Self {
        guard let token else { return self }
        return header("Authorization", "Bearer \(token)")
    }
}
