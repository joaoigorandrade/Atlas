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

/// `run_states` over PostgREST — the same rows `lib/persistence.ts` reads and
/// writes in the browser. RLS scopes every one of them to the bearer, so there
/// is no user id in a path or a filter here: the token is the scope.
enum RunEndpoint {
    private static let table = "rest/v1/run_states"

    /// Every run this learner has, freshest first. The whole snapshot comes
    /// back rather than a summary — the dashboard needs the graph and the
    /// states to draw a card's mastery share, and that is most of the row.
    static func list(apiKey: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: table)
            .query(["select": "subject,snapshot", "order": "updated_at.desc"])
            .header("apikey", apiKey)
            .bearer(token)
    }

    /// Upsert on the primary key. `user_id` is absent from the body on purpose
    /// — the column defaults to `auth.uid()`, which is the only value RLS would
    /// accept anyway.
    static func save(_ row: JSONValue, apiKey: String, token: String) throws -> HTTPRequestData {
        try HTTPRequestData(path: table, method: .post)
            .query(["on_conflict": "user_id,subject"])
            .jsonBody(row)
            .header("apikey", apiKey)
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .bearer(token)
    }
}

/// Supabase auth over its REST API. No SDK: three endpoints, one decode.
enum GoTrueEndpoint {
    static func token(
        _ path: String, grant: String?, _ body: [String: String], apiKey: String
    ) throws -> HTTPRequestData {
        var request = try HTTPRequestData(path: path, method: .post)
            .jsonBody(body)
            .header("apikey", apiKey)
        if let grant { request = request.query(["grant_type": grant]) }
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
