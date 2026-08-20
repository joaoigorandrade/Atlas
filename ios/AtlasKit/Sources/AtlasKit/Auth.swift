import Foundation

/// The signed-in learner, exactly what a native client holds: a bearer token
/// (`Authorization: Bearer` — see `lib/supabase/server.ts`), the refresh token
/// that renews it, and when it stops being valid.
public struct AuthSession: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let email: String?

    public var isExpired: Bool { expiresAt.timeIntervalSinceNow < 60 }
}

/// Supabase auth over its REST API. No SDK: three endpoints, one decode.
/// `AtlasAPI` still owns every *content* request — this owns the token it sends.
public actor AtlasAuth {
    private let baseURL: URL
    private let apiKey: String
    private let session: URLSession

    public init(baseURL: URL, apiKey: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.session = session
    }

    public func signIn(email: String, password: String) async throws -> AuthSession {
        try await token("/auth/v1/token", grant: "password", ["email": email, "password": password])
    }

    /// Returns `nil` when Supabase requires email confirmation — the account
    /// exists but there is no session until the link in the email is opened.
    public func signUp(email: String, password: String) async throws -> AuthSession? {
        do {
            return try await token("/auth/v1/signup", ["email": email, "password": password])
        } catch let error as AtlasError where error.code == "confirm_email" {
            return nil
        }
    }

    public func refresh(_ refreshToken: String) async throws -> AuthSession {
        try await token("/auth/v1/token", grant: "refresh_token", ["refresh_token": refreshToken])
    }

    private func token(_ path: String, grant: String? = nil, _ body: [String: String]) async throws -> AuthSession {
        var url = baseURL.appending(path: path)
        if let grant { url.append(queryItems: [URLQueryItem(name: "grant_type", value: grant)]) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await self.session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw Self.authError(data, status: http.statusCode)
        }
        return try Self.session(from: data)
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
            throw AtlasError(code: "confirm_email", message: "signup awaiting email confirmation",
                             status: 200, requestId: nil)
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
            status: status,
            requestId: nil
        )
    }
}

/// The session on disk. A refresh token is a credential, so it lives in the
/// keychain and nowhere else — never `UserDefaults`, never a file.
public enum SessionStore {
    private static let account = "atlas.session"

    private static func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: account]
    }

    public static func save(_ session: AuthSession?) {
        SecItemDelete(query() as CFDictionary)
        guard let session, let data = try? JSONEncoder().encode(session) else { return }
        var item = query()
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(item as CFDictionary, nil)
    }

    public static func load() -> AuthSession? {
        var item = query()
        item[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }
}
