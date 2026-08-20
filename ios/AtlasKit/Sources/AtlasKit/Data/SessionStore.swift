import Foundation

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
