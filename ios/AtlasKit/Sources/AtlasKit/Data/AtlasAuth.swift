import Foundation
import Networking

/// The signed-in learner, exactly what a native client holds: a bearer token
/// (`Authorization: Bearer` — see `lib/supabase/server.ts`), the refresh token
/// that renews it, and when it stops being valid.
public struct AuthSession: Codable, Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let email: String?

    public var isExpired: Bool { expiresAt.timeIntervalSinceNow < 60 }
}

/// Supabase auth over its REST API. No SDK: three endpoints, one decode.
/// `AtlasAPI` still owns every *content* request — this owns the token it sends.
public actor AtlasAuth {
    private let client: URLSessionNetworkClient
    private let apiKey = Secrets.supabasePublishableKey

    public init(baseURL: URL = Secrets.supabaseURL, session: URLSession = .shared) {
        // Same reason as `AtlasAPI`: GoTrue puts its own `error_code` in the
        // body of a 4xx, and that code is what a screen speaks.
        client = URLSessionNetworkClient(
            baseURL: baseURL,
            session: session,
            successStatusCodes: 0..<600,
            logger: AtlasLog.logger
        )
    }

    public func signIn(email: String, password: String) async throws -> AuthSession {
        try await token("auth/v1/token", grant: "password", ["email": email, "password": password])
    }

    /// Returns `nil` when Supabase requires email confirmation — the account
    /// exists but there is no session until the link in the email is opened.
    public func signUp(email: String, password: String) async throws -> AuthSession? {
        do {
            return try await token(
                "auth/v1/signup", redirect: Self.callbackURL, ["email": email, "password": password]
            )
        } catch let error as AtlasError where error.code == "confirm_email" {
            return nil
        }
    }

    /// "O link nunca chegou" is the most common way confirmation fails, and it
    /// is one more GoTrue POST — no session comes back, only a 200.
    public func resend(email: String) async throws {
        _ = try await post(
            "auth/v1/resend", redirect: Self.callbackURL, ["type": "signup", "email": email]
        )
    }

    public func refresh(_ refreshToken: String) async throws -> AuthSession {
        try await token("auth/v1/token", grant: "refresh_token", ["refresh_token": refreshToken])
    }

    private func token(
        _ path: String, grant: String? = nil, redirect: String? = nil, _ body: [String: String]
    ) async throws -> AuthSession {
        try Self.session(from: await post(path, grant: grant, redirect: redirect, body))
    }

    private func post(
        _ path: String, grant: String? = nil, redirect: String? = nil, _ body: [String: String]
    ) async throws -> Data {
        let request = try GoTrueEndpoint.token(path, grant: grant, redirect: redirect, body, apiKey: apiKey)
        let response: NetworkResponse
        do {
            response = try await client.execute(request)
        } catch {
            throw AtlasError.transport(error)
        }
        guard (200..<300).contains(response.statusCode) else {
            throw Self.authError(response.data, status: response.statusCode)
        }
        return response.data
    }

    /// Where the confirmation email comes back to. Sent as `redirect_to`, so
    /// GoTrue stamps it into the link and redirects to it once the token is
    /// spent — into the app, not into Safari on the web build.
    /// `Project.swift` registers the `atlas` scheme; the Supabase project has to
    /// allow-list this URL under Authentication → URL Configuration.
    public static let callbackURL = "atlas://auth/confirm"

    /// What `atlas://auth/confirm` arrived with. GoTrue puts the tokens — and
    /// its failures — in the URL *fragment*; the web `/auth/confirm` route
    /// redirects with `?error=` in the query. Both halves are read, so one
    /// parser covers a link that came back either way.
    public enum Callback: Sendable, Equatable {
        case session(AuthSession)
        case failed(String)
        case ignored
    }

    public static func callback(_ url: URL) -> Callback {
        var items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        // Kept percent-encoded: `URLComponents` decodes it on the way back out,
        // and decoding twice would eat a `+` or a `%2B` in a token.
        if let fragment = url.fragment(percentEncoded: true), !fragment.isEmpty {
            items += URLComponents(string: "?" + fragment)?.queryItems ?? []
        }
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
        }
        if let access = value("access_token"), let refresh = value("refresh_token") {
            return .session(AuthSession(
                accessToken: access,
                refreshToken: refresh,
                expiresAt: Date(timeIntervalSinceNow: Double(value("expires_in") ?? "") ?? 3600),
                email: nil
            ))
        }
        if let error = value("error_code") ?? value("error") { return .failed(error) }
        return .ignored
    }

    /// GoTrue answers a sign-up that needs confirmation with a *user*, not a
    /// session: no `access_token` at all. That is a state, not a failure.
    static func session(from data: Data) throws -> AuthSession {
        struct Payload: Decodable {
            struct User: Decodable { let email: String? }
            let access_token: String?
            let refresh_token: String?
            let expires_in: Double?
            let user: User?
        }
        let payload = try JSONDecoder().decode(Payload.self, from: data)
        guard let accessToken = payload.access_token, let refreshToken = payload.refresh_token else {
            throw AtlasError(code: "confirm_email", message: "signup awaiting email confirmation", status: 200)
        }
        return AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date(timeIntervalSinceNow: payload.expires_in ?? 3600),
            email: payload.user?.email
        )
    }

    /// GoTrue's own `error_code`, kept as the `AtlasError` code so the screen
    /// picks a sentence instead of showing the server's English.
    static func authError(_ data: Data, status: Int) -> AtlasError {
        struct Failure: Decodable {
            let error_code: String?
            let msg: String?
            let error_description: String?
            let message: String?
        }
        let failure = try? JSONDecoder().decode(Failure.self, from: data)
        return AtlasError(
            code: failure?.error_code ?? codeForStatus(status),
            message: failure?.msg ?? failure?.error_description ?? failure?.message ?? "auth failed (\(status))",
            status: status
        )
    }
}
