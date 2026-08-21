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

    /// Every saved run, freshest first. A row whose snapshot this app has no
    /// version for is skipped rather than guessed at — one unreadable run must
    /// not take the dashboard down with it.
    public func list(token: String) async throws -> [RunSnapshot] {
        struct Row: Decodable { let subject: String; let snapshot: JSONValue }
        let response = try await send(RunEndpoint.list(apiKey: apiKey, token: token))
        let rows: [Row]
        do {
            rows = try JSONDecoder().decode([Row].self, from: response.data)
        } catch {
            throw AtlasError(code: "upstream", message: "could not decode runs: \(error)")
        }
        return rows.compactMap { RunSnapshot(subject: $0.subject, snapshot: $0.snapshot) }
    }

    public func save(_ run: RunSnapshot, token: String) async throws {
        let row = JSONValue.object(["subject": .string(run.subject), "snapshot": run.snapshot])
        _ = try await send(try RunEndpoint.save(row, apiKey: apiKey, token: token))
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
