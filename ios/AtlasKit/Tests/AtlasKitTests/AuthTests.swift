import Foundation
import Testing
@testable import AtlasKit

/// The two GoTrue answers that are not a session, and the one that is. Getting
/// the confirmation case wrong shows a learner an error for a sign-up that
/// worked; getting the error code wrong shows them the server's English.
@Test func signUpAwaitingConfirmationIsNotAFailure() throws {
    let session = Data(#"{"access_token":"jwt","refresh_token":"r1","expires_in":3600,"user":{"email":"a@b.c"}}"#.utf8)
    let decoded = try AtlasAuth.session(from: session)
    #expect(decoded.accessToken == "jwt")
    #expect(decoded.email == "a@b.c")
    #expect(!decoded.isExpired)

    // Confirmation required: a user, no tokens.
    let pending = Data(#"{"id":"u1","email":"a@b.c","confirmation_sent_at":"2026-08-19T00:00:00Z"}"#.utf8)
    #expect(throws: AtlasError.self) { try AtlasAuth.session(from: pending) }
}

@Test func gotrueErrorCodeSurvives() {
    let body = Data(#"{"error_code":"invalid_credentials","msg":"Invalid login credentials"}"#.utf8)
    #expect(AtlasAuth.authError(body, status: 400).code == "invalid_credentials")
    // No code in the body: fall back to the status classification.
    #expect(AtlasAuth.authError(Data("nope".utf8), status: 429).code == "rate_limit")
}

@Test func sessionExpiryLeavesRoomToRefresh() {
    let stale = AuthSession(accessToken: "a", refreshToken: "r",
                            expiresAt: Date(timeIntervalSinceNow: 30), email: nil)
    #expect(stale.isExpired)
}
