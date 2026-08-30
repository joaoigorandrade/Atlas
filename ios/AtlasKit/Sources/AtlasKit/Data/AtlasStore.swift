import Observation
import SwiftUI

/// Everything persisted about a run — the graph, the mastery states, the cached
/// generations. One owner, mirroring `useRunState` on the web: a screen reads
/// this and writes back through it, and never keeps a second copy of a node's
/// state.
@Observable
@MainActor
public final class AtlasStore {
    // Every stored property below is the run, and every one of them saves on
    // change — see `saveSoon`. `subject` is half the row's primary key, so
    // changing it is what starts a second map rather than overwriting the first.
    public var graph: ConceptGraph { didSet { rederive(); saveSoon() } }
    public var states: StateMap { didSet { rederive(); saveSoon() } }
    public var subject: String { didSet { saveSoon() } }
    /// What the learner said they care about, from onboarding. Every generated
    /// kind keys on it, so it travels with the run rather than the screen.
    public var interests = "" { didSet { saveSoon() } }

    /// Why each Shaky node is Shaky, keyed by node id — what lets the drawer
    /// name the moment instead of guessing at the most recent one. Written
    /// wherever `.shaky` is; shared with the browser through the run row.
    public var shakyReasons: [String: ShakyReason] = [:] { didSet { saveSoon() } }

    /// Every review card ever drafted for this run, with its scheduler state.
    /// The generation is a card factory; this is the queue it feeds.
    public var cards: [ScheduledCard] = [] { didSet { saveSoon() } }
    /// Confidence-vs-performance readings, one per node, screen 20's whole
    /// content. Written by the confidence tap before each card is flipped.
    public var calib: [CalibSample] = [] { didSet { saveSoon() } }
    /// Nodes with a real review behind them — what earns Retido, since being
    /// Mastered alone doesn't (`phaseIndex`).
    public var reviewed: Set<String> = [] { didSet { saveSoon() } }

    /// The web's `consumeProgress`, held as JSON and keyed by node id. This
    /// client reads two of its fields (`readingPhaseIndex`) and writes four;
    /// the browser's reader owns the rest — lenses, collapses, checks — so a
    /// record is *merged* into rather than replaced. See `note(reading:)`.
    public var consumeProgress: [String: JSONValue] = [:] { didSet { saveSoon() } }

    /// Every saved run, freshest first — what "Seus mapas" lists. The open one
    /// is in here too, a debounce behind; `maps` answers that one from live
    /// state instead.
    public internal(set) var library: [RunSnapshot] = []

    /// The library could not be read. Not the same as "there are no maps": the
    /// shell shows onboarding for an empty library, and doing that because a GET
    /// failed puts the learner in front of the map builder — where rebuilding
    /// the same subject upserts an empty snapshot over the row they still have.
    public private(set) var libraryFailed = false

    /// The last save did not land. The web app draws a permanent chip for this;
    /// so does the shell now, because a session's whole work sitting unsaved
    /// looks exactly like a saved one until the next launch.
    public private(set) var saveFailed = false

    /// True from the moment a session is adopted until the library it owns has
    /// landed. `session` is what flips the shell, and `loadLibrary` suspends —
    /// without this the shell shows onboarding for the length of that GET.
    public internal(set) var opening = false

    // The four settings screen 13 owns, plus the streak the header reads.
    // UserDefaults *and* the run row: the four below belong to the open map and
    // travel with it (`RunSnapshot`), but they are also what a fresh map starts
    // from, so the device keeps the last answer. The streak is the exception —
    // it is the device's alone until the web's `adherence` is ported.
    // The `quiet` guard is the same one `language` carries: what seeds a *fresh*
    // map is the last answer the learner gave, and opening an old map is the
    // store being filled in, not an answer.
    // The goal orders the frontier (`orderedFrontier`), so changing it changes
    // which node the map recommends — and which one the app pays to warm.
    public var goal: GoalKind = Defaults.goal { didSet { if !quiet { Defaults.goal = goal }; rederive(); saveSoon() } }
    public var dailyTarget: Int = Defaults.dailyTarget { didSet { if !quiet { Defaults.dailyTarget = dailyTarget }; saveSoon() } }
    /// Two fields the phone only collects and carries: the map's Pareto share
    /// and the exam date the web's pace screen counts down from.
    public var paretoPct: Int = paretoLevels[0] { didSet { saveSoon() } }
    public var examDate: String = "" { didSet { saveSoon() } }
    public var dictationOn: Bool = Defaults.dictationOn { didSet { Defaults.dictationOn = dictationOn } }
    public var readAloudOn: Bool = Defaults.readAloudOn { didSet { Defaults.readAloudOn = readAloudOn } }
    /// The language generated content comes back in, and — through
    /// `Defaults.language` pinning `AppleLanguages` — the one the interface is
    /// drawn in from the next launch on.
    public var language: String = Defaults.language {
        didSet {
            // Content follows the open run either way: this is what the model
            // is asked to write in.
            AtlasAPI.language = language
            // The *interface* does not. `Defaults.language` pins
            // `AppleLanguages`, so writing it here would redraw the whole app in
            // the language of whichever run happened to be freshest — silently,
            // and from the next launch on. Deliberately switching it is one of
            // the two moments that honestly know what language a run is in — the
            // other is building the map; `quiet` is what tells them apart.
            if !quiet {
                Defaults.language = language
                loaded?.language = language
            }
            saveSoon()
        }
    }

    /// Consecutive days with work on them.
    /// ponytail: any work counts, and a missed day resets it. The forgiving
    /// freeze and the minutes-met rule live in `lib/curriculum/adherence.ts`
    /// and are a phase of their own.
    public private(set) var streak: Int = Defaults.streak
    private var lastActiveDay: String = Defaults.lastActiveDay

    public let api: AtlasAPI
    public let auth: AtlasAuth
    public let runs: RunStore
    /// Generated content for the open run — what a screen reads instead of
    /// waiting on a model. See `Warm.swift`; it is emptied when the run
    /// changes, since every key names the run it belongs to.
    public let warm = WarmCache()

    /// The row the open run was loaded from, kept so a save can hand back every
    /// key this client does not render. See `RunSnapshot`.
    private var loaded: RunSnapshot?
    /// True while the store is being written *to* rather than *by* the learner
    /// — a restore, a map switch, a sign-out. Without it the clear in `signOut`
    /// would upsert an empty map over the row it had just read.
    private var quiet = true
    private var pendingSave: Task<Void, Never>?
    /// The `warm.revision` last written to `run_states.caches`. What keeps the
    /// generated content out of the upsert until a generation has landed.
    private var savedWarm = 0
    /// True once `run_states.caches` for the open run has actually been read —
    /// or when there is nothing to read, as for a map built on this device.
    /// `cachesRow` merges over what was loaded, so uploading before that read
    /// lands would delete every bucket only the browser fills.
    private var cachesLoaded = true

    /// The signed-in learner, or nil for the auth screens. Writing it is the one
    /// way the bearer token reaches `AtlasAPI` and the keychain.
    public private(set) var session: AuthSession?

    public init(
        api: AtlasAPI, auth: AtlasAuth, runs: RunStore = RunStore(),
        graph: ConceptGraph = .init(), states: StateMap = [:], subject: String = ""
    ) {
        self.api = api
        self.auth = auth
        self.runs = runs
        self.graph = graph
        self.states = states
        self.subject = subject
        // The stored preference is the one the model is told, from launch.
        AtlasAPI.language = language
        rederive()
    }

    /// What each node displays as, frontier included. The only way a surface
    /// asks about a node's state.
    ///
    /// Stored, not computed: `displayStates` walks every edge and every node,
    /// and a single `body` reads this — directly or through `frontier` — half a
    /// dozen times. Deriving on write costs one pass per change instead of one
    /// per read, and `@Observable` tracks a stored property the same way.
    public private(set) var display: [String: NodeState] = [:]
    public private(set) var frontier: [ConceptNode] = []
    public private(set) var masteredCount: Int = 0

    /// Share of the map at `.mastered` — the "território dominado" figure.
    /// Not "learned at least once": learning and shaky do not count, same as the web.
    public var mastered: Double {
        graph.nodes.isEmpty ? 0 : Double(masteredCount) / Double(graph.nodes.count)
    }

    /// The one place the three readings above are produced, in one pass over
    /// the map. Called from every write that can move them.
    private func rederive() {
        let shown = displayStates(states, graph)
        display = shown
        frontier = orderedFrontier(shown, graph, goal)
        masteredCount = graph.nodes.reduce(into: 0) { count, node in
            if (states[node.id] ?? .unknown) == .mastered { count += 1 }
        }
    }
}

// MARK: - Reading record (screen 14)

public extension AtlasStore {
    /// What the spiral needs to know about a node's reading, or nil when there
    /// has never been one — where the state-derived phase stands, as on the web.
    func reading(_ id: String) -> ReadingProgress? {
        guard let record = consumeProgress[id]?.fields else { return nil }
        func flag(_ key: String) -> Bool { if case .bool(true)? = record[key] { true } else { false } }
        return ReadingProgress(finished: flag("finished"), handedOff: flag("handedOff"))
    }

    /// Write the fields this client owns into a node's record, leaving every
    /// other key the browser wrote exactly where it was. Passing nil for a
    /// field means "no news", not "false".
    func note(
        reading id: String, idx: Int? = nil, total: Int? = nil,
        finished: Bool? = nil, handedOff: Bool? = nil
    ) {
        var record = consumeProgress[id]?.fields ?? [:]
        if let idx { record["idx"] = .number(Double(idx)) }
        if let total { record["total"] = .number(Double(total)) }
        if let finished { record["finished"] = .bool(finished) }
        if let handedOff { record["handedOff"] = .bool(handedOff) }
        // The web assigns these straight into state, so a record this client
        // creates has to be a whole `ConsumeProgress`.
        for (key, fallback): (String, JSONValue) in [
            ("idx", .number(0)), ("variant", .object([:])), ("collapsed", .object([:])),
            ("checks", .object([:])), ("termsSeen", .array([])), ("total", .number(0)),
            ("finished", .bool(false)), ("handedOff", .bool(false)),
        ] {
            record[key] = record[key] ?? fallback
        }
        consumeProgress[id] = .object(record)
    }
}

// MARK: - Retain (screens 11, 19, 20)

public extension AtlasStore {
    /// Today's deck: what is due, cut to the daily target.
    var queue: [ScheduledCard] { todaysQueue(cards, target: dailyTarget) }

    /// Nodes worth drafting cards for — learned at least once, no card yet.
    var uncovered: [ConceptNode] {
        graph.nodes.filter { node in
            (states[node.id] ?? .unknown).isLearned && !cards.contains { $0.card.node == node.id }
        }
    }

    /// Take the scheduler's word for where a card goes next.
    func schedule(_ card: ScheduledCard) {
        guard let index = cards.firstIndex(where: { $0.id == card.id }) else { return cards.append(card) }
        cards[index] = card
    }

    /// Merge a felt/real reading into the curve — a running average per node,
    /// exactly as `recordCalib` does on the web.
    func recordCalib(_ nodeId: String, felt: Int, real: Int) {
        guard let index = calib.firstIndex(where: { $0.id == nodeId }) else {
            return calib.append(CalibSample(id: nodeId, felt: felt, real: real))
        }
        calib[index].felt = (calib[index].felt + felt) / 2
        calib[index].real = (calib[index].real + real) / 2
    }

    /// Tick the streak. Same day: nothing. Yesterday: onwards. Anything older:
    /// back to one, which is today.
    func markActiveToday() {
        let today = Self.day(.now)
        guard today != lastActiveDay else { return }
        streak = lastActiveDay == Self.day(.now.addingTimeInterval(-86_400)) ? streak + 1 : 1
        lastActiveDay = today
        Defaults.streak = streak
        Defaults.lastActiveDay = today
    }

    /// The local calendar day — the streak rolls over at the learner's
    /// midnight, not at GMT's.
    static func day(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 0)-\(parts.month ?? 0)-\(parts.day ?? 0)"
    }
}

// MARK: - Session

public extension AtlasStore {
    var signedIn: Bool { session != nil }

    /// Launch: pick the stored session back up, renewing it if it has aged out,
    /// then pull the maps it owns. The shell draws nothing until this returns,
    /// which is what keeps a signed-in learner with a saved map from seeing
    /// onboarding flash before the map lands.
    ///
    /// The token is renewed here and, from then on, by `bearer()` — a run
    /// outlives the hour an access token is good for, and a save that quietly
    /// 401s all afternoon is a week of work that never left the phone.
    func restore() async {
        if Fixtures.enabled { return adoptFixtures() }
        defer { quiet = false }
        guard let stored = SessionStore.load() else { return }
        if stored.isExpired {
            do {
                await adopt(try await auth.refresh(stored.refreshToken))
            } catch {
                // Only an answer from GoTrue means the credential is dead. A
                // transport failure means the phone is on a plane — keep the
                // refresh token and try again next launch rather than signing
                // the learner out for being offline.
                if (error as? AtlasError)?.status != nil { await signOut(flush: false) }
                return
            }
        } else {
            await adopt(stored)
        }
        await loadLibrary()
    }

    /// Read every saved run and open the freshest — the row `updated_at` sorts
    /// first. This is the whole reason a relaunch lands on the dashboard rather
    /// than on onboarding: the map outlives the process because it is a row.
    func loadLibrary() async {
        opening = true
        defer { opening = false }
        guard let token = await bearer() else { return }
        guard let saved = try? await runs.list(token: token) else {
            libraryFailed = true
            return
        }
        libraryFailed = false
        library = saved
        guard let freshest = saved.first, graph.nodes.isEmpty else { return }
        open(freshest)
        await hydrateCaches()
    }

    /// The open run's generated content, read on its own — `list` deliberately
    /// leaves the column behind, since it is the large half of every row and
    /// only the run actually on screen has any use for it.
    private func hydrateCaches() async {
        guard var run = loaded, let token = await bearer(),
              let column = try? await runs.caches(subject: run.subject, token: token)
        else { return }
        // A v1/v2 row keeps its caches inside the snapshot, where the decode
        // already found them; an empty column must not wipe that.
        run.caches = column.isEmpty ? run.caches : column
        // The learner can have switched maps during the GET.
        guard run.subject == subject else { return }
        loaded = run
        cachesLoaded = true
        // A generation that landed while this was in flight has to still go up
        // on the next save, so only a clean warm adopts the seeded revision.
        let dirty = warm.revision != savedWarm
        seedWarm(run.caches)
        if !dirty { savedWarm = warm.revision }
    }

    /// Point the live run at a saved one. Every write here is the store being
    /// filled in, not the learner working, so nothing is saved on the way.
    private func open(_ run: RunSnapshot) {
        let wasQuiet = quiet
        quiet = true
        defer { quiet = wasQuiet }
        loaded = run
        cachesLoaded = false
        warm.clear()
        subject = run.subject
        graph = run.graph
        states = run.states
        shakyReasons = run.shakyReasons
        interests = run.interests
        goal = run.goal
        dailyTarget = run.target
        paretoPct = run.paretoPct
        examDate = run.examDate
        cards = run.cards
        calib = run.calib
        reviewed = run.reviewed
        consumeProgress = run.consumeProgress
        // Only when the row records one: a pre-v9 run's content language is
        // genuinely unknown, and the device preference is the honest fallback.
        if let language = run.language { self.language = language }
        // Last, because a warm key is built from the subject, the graph and the
        // language above: this is the reading the browser already paid for.
        seedWarm(run.caches)
        savedWarm = warm.revision
    }

    /// Open another saved map. The one being left is flushed first — switching
    /// must not be the thing that loses the last two seconds of a run.
    func switchTo(_ run: RunSnapshot) async {
        guard run.subject != subject else { return }
        await saveNow()
        open(run)
        await hydrateCaches()
    }

    /// Start a second map. Clearing the live run is the whole trigger: the shell
    /// shows onboarding for exactly as long as there is no map, and onboarding's
    /// `finish()` writes a *new* row under the new subject. Nothing is deleted
    /// — the run left behind is a row, and stays on the dashboard.
    func newMap() async {
        await saveNow()
        quiet = true
        defer { quiet = false }
        loaded = nil
        // A map that does not exist yet has no column to merge over, so the
        // first generation can go up as it is.
        cachesLoaded = true
        clearRun()
    }

    /// The dashboard's list: every saved map, with the open one answered from
    /// live state rather than from its row, which is a debounce behind.
    var maps: [RunSnapshot] {
        guard !subject.isEmpty else { return library }
        let live = currentRun
        guard let index = library.firstIndex(where: { $0.subject == subject }) else {
            return [live] + library
        }
        var maps = library
        maps[index] = live
        return maps
    }

    /// The open run as a row: live state written over the one it was loaded
    /// from, so the keys only the browser fills in survive the round trip.
    private var currentRun: RunSnapshot {
        var run = loaded ?? RunSnapshot(subject: subject)
        run.subject = subject
        run.graph = graph
        run.states = states
        run.shakyReasons = shakyReasons
        run.interests = interests
        run.goal = goal
        run.target = dailyTarget
        run.paretoPct = paretoPct
        run.examDate = examDate
        // Only a run this device built records a language here. A row written
        // before the field existed has genuinely never recorded one, and
        // stamping the device preference on it would freeze the wrong answer
        // permanently — see `RunSnapshot.language`.
        if loaded == nil { run.language = language }
        run.calib = calib
        run.reviewed = reviewed
        run.consumeProgress = consumeProgress
        run.cards = cards
        return run
    }

    /// Persist the open run a beat after the last change. Every write the
    /// learner makes lands here — a graded card, a spawned gap, a settings tap
    /// — so the debounce is what keeps a review session from being one upsert
    /// per button.
    private func saveSoon() {
        guard !quiet, signedIn, !subject.isEmpty else { return }
        saveIn(2)
    }

    /// Arm the one pending write. Two seconds behind a change, fifteen behind a
    /// failure — a phone in a tunnel must not retry every two seconds all
    /// afternoon, and any change the learner makes supersedes the retry anyway.
    private func saveIn(_ seconds: Int) {
        pendingSave?.cancel()
        pendingSave = Task {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            // Let go of the handle before flushing: `saveNow` cancels whatever
            // is pending, and that used to be *this* task — which cancelled the
            // upsert it had just started and dropped the write on the floor.
            pendingSave = nil
            await saveNow()
        }
    }

    /// Write now, and remember what was written so the dashboard's card for the
    /// open map stops being a debounce behind.
    ///
    /// A failure is kept — `saveFailed` draws the chip and a retry is armed, so
    /// a session worked through offline lands as soon as there is signal.
    func saveNow() async {
        pendingSave?.cancel()
        pendingSave = nil
        guard signedIn, !subject.isEmpty, var token = await bearer() else { return }
        // The column was never read — at open, or because that read failed. A
        // generation waits for it rather than merging over nothing, which would
        // drop every bucket only the browser fills.
        if warm.revision != savedWarm, !cachesLoaded { await hydrateCaches() }
        var run = currentRun
        // The generated content only goes up when a generation has landed since
        // the last write — it is the large half of the row, and a node drag
        // must not re-upload every section the learner has read.
        let revision = warm.revision
        let sendCaches = revision != savedWarm && cachesLoaded
        if sendCaches { run.caches = cachesRow(over: run.caches) }
        do {
            try await runs.save(run, caches: sendCaches, token: token)
        } catch {
            // A 401 means the token died between the check above and the write.
            // Renewing and trying once more is the difference between a save
            // that lands and an afternoon of work nobody knows is unsaved.
            guard (error as? AtlasError)?.code == "auth", let renewed = await bearer(renew: true),
                  (try? await runs.save(run, caches: sendCaches, token: renewed)) != nil
            else {
                saveFailed = true
                saveIn(15)
                return
            }
            token = renewed
        }
        saveFailed = false
        // The learner can have signed out — or signed in as somebody else —
        // while that upsert was in flight. Writing this run back into `loaded`
        // and `library` now would hand it to whoever is holding the phone next,
        // and their first save would start from this run's row.
        guard session?.accessToken == token else { return }
        savedWarm = revision
        loaded = run
        if let index = library.firstIndex(where: { $0.subject == run.subject }) {
            library[index] = run
        } else {
            library.insert(run, at: 0)
        }
    }

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
        library = []
        // The map belongs to the learner who signed in, not to the device.
        clearRun()
        SessionStore.save(nil)
        // Awaited, not fired: a warm still in flight must not be able to send
        // one more request bearing the token of someone who has signed out.
        await api.setAccessToken(nil)
    }

    /// Put the live run back to nothing. Shared by signing out and by starting
    /// a second map — both leave the shell with no map, which is what routes it
    /// to onboarding. Callers hold `quiet` for the duration.
    private func clearRun() {
        warm.clear()
        graph = ConceptGraph()
        states = [:]
        shakyReasons = [:]
        subject = ""
        interests = ""
        paretoPct = paretoLevels[0]
        examDate = ""
        cards = []
        calib = []
        reviewed = []
        consumeProgress = [:]
    }

    /// `ATLAS_FIXTURES=1` boots straight into a demo run: the map and the node
    /// sheet are buildable before onboarding exists to produce a real graph.
    private func adoptFixtures() {
        // `quiet` stays set: a fixture run is a demo, and upserting it would put
        // it on the dashboard of whichever account the build is signed into.
        session = Fixtures.session
        graph = Fixtures.graph
        states = Fixtures.states
        subject = Fixtures.subject
        cards = Fixtures.cards
        calib = Fixtures.calib
    }

    /// The bearer for a run request, renewed when it has aged out. Every read
    /// and write of `run_states` asks here rather than reading `session`
    /// directly: an access token is good for an hour and a run is not.
    ///
    /// Nil means there is no usable credential — offline, or a refresh token
    /// GoTrue has rejected. The caller treats that as the request failing;
    /// signing the learner out on it would do it for a flight-mode phone too.
    private func bearer(renew: Bool = false) async -> String? {
        guard let session else { return nil }
        guard renew || session.isExpired else { return session.accessToken }
        guard let renewed = try? await auth.refresh(session.refreshToken) else { return nil }
        await adopt(renewed, opening: false)
        return renewed.accessToken
    }

    /// `opening: false` for a mid-session renewal: the shell reads `opening` to
    /// hold onboarding back until a library lands, and a refresh has no library
    /// coming after it.
    private func adopt(_ session: AuthSession, opening: Bool = true) async {
        // Set before `session`, cleared by `loadLibrary` — every adopt is
        // followed by one.
        if opening { self.opening = true }
        self.session = session
        SessionStore.save(session)
        await api.setAccessToken(session.accessToken)
    }
}
