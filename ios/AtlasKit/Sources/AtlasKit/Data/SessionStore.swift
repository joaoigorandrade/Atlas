import Foundation
import OSLog

/// The session on disk. A refresh token is a credential, so it lives in the
/// keychain and nowhere else — never `UserDefaults`, never a file.
public enum SessionStore {
    private static let account = "atlas.session"
    /// For a generic password the item's identity is account + service, so
    /// leaving the service off files it under `""` — a name any other component
    /// that made the same omission would collide with.
    private static let service = "com.joaoigor.atlas"
    /// Keychain items outlive the app on iOS, so delete-and-reinstall would
    /// silently hand the new install the previous account's session. This is the
    /// only thing that makes reinstalling the reset gesture everyone assumes.
    private static let installedKey = "keychain.installed"

    private static func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public static func save(_ session: AuthSession?) {
        let deleted = SecItemDelete(query() as CFDictionary)
        if deleted != errSecSuccess, deleted != errSecItemNotFound {
            AtlasLog.log.error("keychain delete failed: \(deleted)")
        }
        // Only the refresh token has to survive a launch — `restore` exchanges
        // it for an access token anyway. Storing the bearer too would mean a
        // keychain dump hands over a token that is live right now instead of one
        // that still has to be redeemed at GoTrue, under its rate limits and its
        // revocation. `expiresAt` in the past is what routes `restore` through
        // the refresh; it is not a claim about the token that was handed in.
        guard let session, let data = try? JSONEncoder().encode(AuthSession(
            accessToken: "", refreshToken: session.refreshToken,
            expiresAt: .distantPast, email: session.email
        )) else { return }
        var item = query()
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let added = SecItemAdd(item as CFDictionary, nil)
        // A silently failed write looks exactly like a successful one until the
        // learner finds themselves signed out at the next launch.
        if added != errSecSuccess { AtlasLog.log.error("keychain save failed: \(added)") }
    }

    public static func load() -> AuthSession? {
        if !UserDefaults.standard.bool(forKey: installedKey) {
            UserDefaults.standard.set(true, forKey: installedKey)
            save(nil)
            // Pre-service builds filed the item under service "", which is a
            // different primary key and would otherwise be orphaned forever.
            SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: account,
            ] as CFDictionary)
            return nil
        }
        var item = query()
        item[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }
}
