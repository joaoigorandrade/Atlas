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
    ///
    /// `caches` is deliberately *not* selected: it is the large half of the row
    /// and only the open run ever needs it — see `caches(subject:)`, which is
    /// the same split `lib/persistence.ts` makes between `listRuns` and its
    /// per-subject caches read.
    static func list(apiKey: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: table)
            .query([
                "select": "subject,snapshot", "order": "updated_at.desc",
                // ponytail: a dashboard nobody scrolls past 50 maps on. Paginate
                // when someone has more than that.
                "limit": "50",
            ])
            .header("apikey", apiKey)
            .bearer(token)
    }

    /// The generated content for one run. Fetched on open and nowhere else.
    static func caches(subject: String, apiKey: String, token: String) -> HTTPRequestData {
        HTTPRequestData(path: table)
            // Quoted: PostgREST reads a bare comma or parenthesis in a filter
            // value as syntax, and a subject is whatever the learner typed.
            .query([
                "select": "caches", "limit": "1",
                "subject": "eq.\"\(subject.replacingOccurrences(of: "\"", with: "\\\""))\"",
            ])
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
