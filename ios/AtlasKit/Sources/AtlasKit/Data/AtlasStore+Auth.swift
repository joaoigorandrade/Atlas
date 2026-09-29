import Foundation

// The credential: signing in and out, restoring a stored session, and the
// bearer every request asks for. Split out of `AtlasStore.swift` so the one
// place a token is renewed is also the one file that holds it.

extension AtlasStore {
    func signIn(email: String, password: String) async throws {
        await adopt(try await auth.signIn(email: email, password: password))
        // Signing in on a second device is the other half of "my maps are in the
        // database": the run has to arrive with the session, not on the next launch.
        await loadLibrary()
    }

    /// `false` means Supabase sent a confirmation email — screen 3, not a session.
    func signUp(email: String, password: String) async throws -> Bool {
        guard let session = try await auth.signUp(email: email, password: password) else { return false }
        await adopt(session)
        await loadLibrary()
        return true
    }

    /// A confirmation link came back into the app carrying its own session —
    /// the learner is signed in by the tap on the link, not by the form.
    func signIn(with session: AuthSession) async {
        await adopt(session)
        await loadLibrary()
    }

    /// Send the password-reset link.
    func recoverPassword(email: String) async throws {
        try await auth.recover(email: email)
    }

    /// Set the password a recovery link signed the learner in to replace.
    func updatePassword(_ password: String) async throws {
        guard let token = await bearer() else { throw AtlasError(code: "auth", message: "no session", status: 401) }
        try await auth.updatePassword(password, token: token)
    }

    /// Screen 3's "reenviar link". Throws so the screen can speak the failure.
    func resendConfirmation(email: String) async throws {
        try await auth.resend(email: email)
    }

    /// `flush: false` is for the two sign-outs with nowhere to write to — the
    /// account has just been deleted, or the stored session was rejected.
    func signOut(flush: Bool = true) async {
        // Flush before anything else, the way `switchTo` and `newMap` do: the
        // card graded two seconds ago is still sitting in the debounce, and
        // cancelling it here is what used to drop it on the floor.
        if flush { await saveNow() }
        // Quiet next: the clear below is nine writes, and every one of them
        // would otherwise queue a save that upserts an empty map over the row
        // this learner just spent a week filling in.
        quiet = true
        defer { quiet = false }
        pendingSave?.cancel()
        opening = false
        libraryFailed = false
        saveFailed = false
        session = nil
        loaded = nil
        topicId = nil
        library = []
        // The map belongs to the learner who signed in, not to the device — and
        // that is true of the mirror on disk too. The next person to hold this
        // phone must not open somebody else's map.
        local.clear()
        // A reminder is about this learner's cards; the next one to hold the
        // phone has not asked for it.
        if Defaults.reminderOn {
            Defaults.reminderOn = false
            Task { await Reminders.apply() }
        }
        clearRun()
        SessionStore.save(nil)
        // Awaited, not fired: a warm still in flight must not be able to send
        // one more request bearing the token of someone who has signed out.
        await api.setAccessToken(nil)
    }

    /// Put the live run back to nothing. Shared by signing out and by starting
    /// a second map — both leave the shell with no map, which is what routes it
    /// to onboarding. Callers hold `quiet` for the duration.
    func clearRun() {
        runEpoch += 1
        challenge = nil
        warm.clear()
        deck = []
        forecast = []
        deckRemaining = 0
        graph = ConceptGraph()
        states = [:]
        shakyReasons = [:]
        phasesDone = [:]
        subject = ""
        interests = ""
        paretoPct = paretoLevels[0]
        examDate = ""
        cards = []
        calib = []
        reviewed = []
        consumeProgress = [:]
        socraticProgress = [:]
        feynmanProgress = [:]
        connectProgress = [:]
        phaseProgress = [:]
        misconceptions = []
    }

    /// `ATLAS_FIXTURES=1` boots straight into a demo run: the map and the node
    /// sheet are buildable before onboarding exists to produce a real graph.
    func adoptFixtures() {
        // `quiet` stays set: a fixture run is a demo, and upserting it would put
        // it on the dashboard of whichever account the build is signed into.
        session = Fixtures.session
        graph = Fixtures.graph
        states = Fixtures.states
        phasesDone = Fixtures.phasesDone
        shakyReasons = ["lat": .connectComplete]
        subject = Fixtures.subject
        calib = Fixtures.calib
        // The deck directly, not the card store: fixture mode makes no request,
        // and the deck is normally the server's answer.
        deck = Fixtures.cards
        cards = Fixtures.cards.map {
            StoredCard(
                id: $0.id, nodeId: $0.node, type: $0.type, source: $0.source,
                cloze: $0.cloze, answer: $0.answer, front: $0.front,
                back: $0.back, reExplain: $0.reExplain
            )
        }
    }

    /// The bearer for a run request, renewed when it has aged out. Every read
    /// and write of `run_states` asks here rather than reading `session`
    /// directly: an access token is good for an hour and a run is not.
    ///
    /// Nil means there is no usable credential — offline, or a refresh token
    /// GoTrue has rejected. The caller treats that as the request failing;
    /// signing the learner out on it would do it for a flight-mode phone too.
    ///
    /// GoTrue *refusing* the refresh token is different: it will never work
    /// again, and every save and warm used to ask again with it, forever.
    func bearer(renew: Bool = false) async -> String? {
        guard let session else { return nil }
        guard renew || session.isExpired else { return session.accessToken }
        switch await renewOnce(session.refreshToken) {
        case .success(let renewed): return renewed.accessToken
        case .failure(let error):
            if Self.rejected(error) { await signOut(flush: false) }
            return nil
        }
    }

    /// GoTrue answered and said no. A transport failure — a phone on a plane —
    /// keeps the refresh token for next time, and so does a rate limit.
    static func rejected(_ error: any Error) -> Bool {
        guard let status = (error as? AtlasError)?.status else { return false }
        return (400..<500).contains(status) && status != 429
    }

    /// Renew the session, once — see `renewal`.
    func renewOnce(_ refreshToken: String) async -> Result<AuthSession, any Error> {
        if let renewal { return await renewal.value }
        let task = Task<Result<AuthSession, any Error>, Never> { [auth] in
            do { return .success(try await auth.refresh(refreshToken)) }
            catch { return .failure(error) }
        }
        renewal = task
        let outcome = await task.value
        renewal = nil
        // A sign-out while the refresh was in flight must stay signed out — and
        // a different learner signed in meanwhile must not get this one's.
        if case .success(let renewed) = outcome, session?.refreshToken == refreshToken {
            await adopt(renewed, opening: false)
        }
        return outcome
    }

    /// `opening: false` for a mid-session renewal: the shell reads `opening` to
    /// hold onboarding back until a library lands, and a refresh has no library
    /// coming after it.
    func adopt(_ session: AuthSession, opening: Bool = true) async {
        // Set before `session`, cleared by `loadLibrary` — every adopt is
        // followed by one.
        if opening { self.opening = true }
        self.session = session
        SessionStore.save(session)
        await api.setAccessToken(session.accessToken) { [weak self] in await self?.bearer() }
    }
}
