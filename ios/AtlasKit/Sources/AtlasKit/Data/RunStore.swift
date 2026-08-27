import Foundation
import Networking

/// The learner's saved runs, in Postgres. Two calls — read every row, upsert
/// one — against the same `run_states` table the web app writes, so a map built
/// on the phone opens in the browser and back.
///
/// Its own client for the same reason `AtlasAuth` holds one: this is Supabase,
/// not the web app, and `AtlasAPI`'s base URL is the deployment.
public actor RunStore {
    private let client: URLSessionNetworkClient
    private let apiKey = Secrets.supabasePublishableKey

    public init(baseURL: URL = Secrets.supabaseURL, session: URLSession = .shared) {
        client = URLSessionNetworkClient(
            baseURL: baseURL,
            session: session,
            // Same as everywhere else: PostgREST puts its own message in the
            // body of a 4xx, and `NetworkError.httpError` would drop it.
            successStatusCodes: 0..<600,
            logger: AtlasLog.logger
        )
    }

    /// Every saved run, freshest first, without its generated content — see
    /// `caches(subject:)`. A row whose snapshot this app has no
    /// version for is skipped rather than guessed at — one unreadable run must
    /// not take the dashboard down with it.
    public func list(token: String) async throws -> [RunSnapshot] {
        let response = try await send(RunEndpoint.list(apiKey: apiKey, token: token))
        // Decoded row by row, not as `[Row]`: a typed array decode throws whole,
        // so one malformed row would take every other map down with it — which
        // is the opposite of what the line above promises.
        let rows: [JSONValue]
        do {
            rows = try JSONDecoder().decode([JSONValue].self, from: response.data)
        } catch {
            throw AtlasError(code: "upstream", message: "could not decode runs: \(error)")
        }
        return rows.compactMap { row in
            guard let fields = row.fields, case .string(let subject) = fields["subject"] ?? .null else { return nil }
            return RunSnapshot(subject: subject, snapshot: fields["snapshot"] ?? .null)
        }
    }

    /// The generated content for one run — the half `list` leaves behind. Empty
    /// when the row has never had a generation, which is not an error.
    public func caches(subject: String, token: String) async throws -> [String: JSONValue] {
        let response = try await send(RunEndpoint.caches(subject: subject, apiKey: apiKey, token: token))
        let rows = try? JSONDecoder().decode([JSONValue].self, from: response.data)
        return rows?.first?.fields?["caches"]?.fields ?? [:]
    }

    /// Upsert the run. `caches` is the generated content — by far the larger
    /// half of the row and unchanged by anything but a generation — so it is
    /// only sent when one has landed. A column left out of the body is a column
    /// the upsert does not touch, which is what lets the two travel apart.
    public func save(_ run: RunSnapshot, caches: Bool, token: String) async throws {
        var row: [String: JSONValue] = ["subject": .string(run.subject), "snapshot": run.snapshot]
        if caches { row["caches"] = .object(run.caches) }
        _ = try await send(try RunEndpoint.save(.object(row), apiKey: apiKey, token: token))
    }

    /// Execute and classify, the one place a run request becomes an `AtlasError`.
    private func send(_ request: any HTTPRequest) async throws -> NetworkResponse {
        let response: NetworkResponse
        do {
            response = try await client.execute(request)
        } catch {
            throw AtlasError.transport(error)
        }
        guard (200..<300).contains(response.statusCode) else {
            throw Self.storageError(response)
        }
        return response
    }

    /// PostgREST answers a failure with `{message, code, hint, details}` — its
    /// own prose about a schema the learner has never heard of. The status is
    /// what picks the sentence; the message is for the log.
    static func storageError(_ response: NetworkResponse) -> AtlasError {
        struct Failure: Decodable { let message: String? }
        let failure = try? JSONDecoder().decode(Failure.self, from: response.data)
        return AtlasError(
            code: codeForStatus(response.statusCode),
            message: failure?.message ?? "run request failed (\(response.statusCode))",
            status: response.statusCode
        )
    }
}
