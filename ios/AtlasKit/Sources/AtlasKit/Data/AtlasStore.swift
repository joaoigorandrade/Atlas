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

    /// Every review card ever drafted for this run, with its scheduler state.
    /// The generation is a card factory; this is the queue it feeds.
    public var cards: [ScheduledCard] = [] { didSet { saveSoon() } }
    /// Confidence-vs-performance readings, one per node, screen 20's whole
    /// content. Written by the confidence tap before each card is flipped.
    public var calib: [CalibSample] = [] { didSet { saveSoon() } }
    /// Nodes with a real review behind them — what earns Retido, since being
    /// Mastered alone doesn't (`phaseIndex`).
    public var reviewed: Set<String> = [] { didSet { saveSoon() } }

    /// Every saved run, freshest first — what "Seus mapas" lists. The open one
    /// is in here too, a debounce behind; `maps` answers that one from live
    /// state instead.
    public private(set) var library: [RunSnapshot] = []

    // The four settings screen 13 owns, plus the streak the header reads.
    // UserDefaults *and* the run row: the four below belong to the open map and
    // travel with it (`RunSnapshot`), but they are also what a fresh map starts
    // from, so the device keeps the last answer. The streak is the exception —
    // it is the device's alone until the web's `adherence` is ported.
    public var goal: GoalKind = Defaults.goal { didSet { Defaults.goal = goal; saveSoon() } }
    public var dailyTarget: Int = Defaults.dailyTarget { didSet { Defaults.dailyTarget = dailyTarget; saveSoon() } }
    public var dictationOn: Bool = Defaults.dictationOn { didSet { Defaults.dictationOn = dictationOn } }
    public var readAloudOn: Bool = Defaults.readAloudOn { didSet { Defaults.readAloudOn = readAloudOn } }
    /// The language generated content comes back in. The interface follows the
    /// device (the String Catalog); this is the one the model is told.
    public var language: String = Defaults.language {
        didSet {
            AtlasAPI.language = language
            Defaults.language = language
            // Deliberately switching it is one of the two moments that honestly
            // know what language a run's content is in — the other is building
            // the map. `quiet` is what tells the two apart from a restore.
            if !quiet { loaded?.language = language }
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

    /// The row the open run was loaded from, kept so a save can hand back every
    /// key this client does not render. See `RunSnapshot`.
    private var loaded: RunSnapshot?
    /// True while the store is being written *to* rather than *by* the learner
    /// — a restore, a map switch, a sign-out. Without it the clear in `signOut`
    /// would upsert an empty map over the row it had just read.
    private var quiet = true
    private var pendingSave: Task<Void, Never>?

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

    /// Share of the map learned at least once — the "território dominado" figure.
    public var mastered: Double {
        graph.nodes.isEmpty ? 0 : Double(masteredCount) / Double(graph.nodes.count)
    }

    /// The one place the three readings above are produced, in one pass over
    /// the map. Called from every write that can move them.
    private func rederive() {
        let shown = displayStates(states, graph)
        display = shown
        frontier = graph.nodes.filter { shown[$0.id] == .frontier }
        masteredCount = graph.nodes.reduce(into: 0) { count, node in
            if (states[node.id] ?? .unknown) == .mastered { count += 1 }
        }
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
    /// ponytail: refreshed at launch only — a token that expires mid-run lands
    /// the learner on the auth screen. Refresh on a 401 when runs outlive an hour.
    func restore() async {
        if Fixtures.enabled { return adoptFixtures() }
        defer { quiet = false }
        guard let stored = SessionStore.load() else { return }
        if stored.isExpired {
            guard let renewed = try? await auth.refresh(stored.refreshToken) else {
                return signOut()
            }
            await adopt(renewed)
        } else {
            await adopt(stored)
        }
        await loadLibrary()
    }

    /// Read every saved run and open the freshest — the row `updated_at` sorts
    /// first. This is the whole reason a relaunch lands on the dashboard rather
    /// than on onboarding: the map outlives the process because it is a row.
    func loadLibrary() async {
        guard let token = session?.accessToken else { return }
        // ponytail: a library that won't load leaves the learner on onboarding,
        // which is wrong but recoverable — building a map with the same subject
        // upserts the same row. Give it the web app's "not saved" chip when
        // this stops being the development phase.
        guard let saved = try? await runs.list(token: token) else { return }
        library = saved
        if let freshest = saved.first, graph.nodes.isEmpty { open(freshest) }
    }

    /// Point the live run at a saved one. Every write here is the store being
    /// filled in, not the learner working, so nothing is saved on the way.
    private func open(_ run: RunSnapshot) {
        let wasQuiet = quiet
        quiet = true
        defer { quiet = wasQuiet }
        loaded = run
        subject = run.subject
        graph = run.graph
        states = run.states
        interests = run.interests
        goal = run.goal
        dailyTarget = run.target
        cards = run.cards
        calib = run.calib
        reviewed = run.reviewed
        // Only when the row records one: a pre-v9 run's content language is
        // genuinely unknown, and the device preference is the honest fallback.
        if let language = run.language { self.language = language }
    }

    /// Open another saved map. The one being left is flushed first — switching
    /// must not be the thing that loses the last two seconds of a run.
    func switchTo(_ run: RunSnapshot) async {
        guard run.subject != subject else { return }
        await saveNow()
        open(run)
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
        run.interests = interests
        run.goal = goal
        run.target = dailyTarget
        // Only a run this device built records a language here. A row written
        // before the field existed has genuinely never recorded one, and
        // stamping the device preference on it would freeze the wrong answer
        // permanently — see `RunSnapshot.language`.
        if loaded == nil { run.language = language }
        run.calib = calib
        run.reviewed = reviewed
        run.cards = cards
        return run
    }

    /// Persist the open run a beat after the last change. Every write the
    /// learner makes lands here — a graded card, a spawned gap, a settings tap
    /// — so the debounce is what keeps a review session from being one upsert
    /// per button.
    private func saveSoon() {
        guard !quiet, signedIn, !subject.isEmpty else { return }
        pendingSave?.cancel()
        pendingSave = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await saveNow()
        }
    }

    /// Write now, and remember what was written so the dashboard's card for the
    /// open map stops being a debounce behind.
    ///
    /// ponytail: a failed save is dropped and the next change retries it. The
    /// web app draws a permanent "not saved" chip for this; add one here when
    /// the run is worth more than a rebuild.
    func saveNow() async {
        pendingSave?.cancel()
        guard signedIn, !subject.isEmpty, let token = session?.accessToken else { return }
        let run = currentRun
        guard (try? await runs.save(run, token: token)) != nil else { return }
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

    func signOut() {
        // Quiet first: the clear below is nine writes, and every one of them
        // would otherwise queue a save that upserts an empty map over the row
        // this learner just spent a week filling in.
        quiet = true
        defer { quiet = false }
        pendingSave?.cancel()
        session = nil
        loaded = nil
        library = []
        // The map belongs to the learner who signed in, not to the device.
        clearRun()
        SessionStore.save(nil)
        Task { await api.setAccessToken(nil) }
    }

    /// Put the live run back to nothing. Shared by signing out and by starting
    /// a second map — both leave the shell with no map, which is what routes it
    /// to onboarding. Callers hold `quiet` for the duration.
    private func clearRun() {
        graph = ConceptGraph()
        states = [:]
        subject = ""
        interests = ""
        cards = []
        calib = []
        reviewed = []
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

    private func adopt(_ session: AuthSession) async {
        self.session = session
        SessionStore.save(session)
        await api.setAccessToken(session.accessToken)
    }
}
