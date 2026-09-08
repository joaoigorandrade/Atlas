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

    /// Every review card drafted for this run. The generation is a card
    /// factory; `deck` below is the queue it feeds, and the scheduler that
    /// orders that queue runs on the server — see `Retain.swift`.
    public var cards: [StoredCard] = [] { didSet { saveSoon() } }
    /// Today's deck, as the server budgeted it, with the real interval already
    /// on every grade button. Loaded when Review opens; empty otherwise.
    public internal(set) var deck: [ReviewCard] = []
    public internal(set) var forecast: [RetainContent.ForecastRow] = []
    /// Confidence-vs-performance readings, one per node, screen 20's whole
    /// content. Written by the confidence tap before each card is flipped.
    public var calib: [CalibSample] = [] { didSet { saveSoon() } }
    /// Nodes with a real review behind them — what earns Retido, since being
    /// Mastered alone doesn't (`phaseIndex`).
    public var reviewed: Set<String> = [] { didSet { saveSoon() } }

    /// The web's `consumeProgress`, held as JSON and keyed by node id. This
    /// client reads four of its fields (`readingPhaseIndex`, and where the
    /// learner got to) and writes five; the browser's reader owns the rest —
    /// lenses, collapses, terms — so a record is *merged* into rather than
    /// replaced. See `note(reading:)`.
    public var consumeProgress: [String: JSONValue] = [:] { didSet { saveSoon() } }

    /// How often each lens has been opened. SPEC §6's adaptive modality is a
    /// tally and a marked chip, not a second content path: the way a learner
    /// reaches for "Analogia" three sections running is the app's only evidence
    /// of how they prefer to be taught.
    ///
    /// ponytail: this run only, not persisted — it is a hint on a chip, and
    /// carrying it into `consumeProgress.variant` can wait until something
    /// other than a border reads it.
    public private(set) var lensPicks: [AltKey: Int] = [:]

    /// The lens to mark on later sections, once one is clearly the favourite.
    public var preferredLens: AltKey? {
        guard let top = lensPicks.max(by: { $0.value < $1.value }), top.value >= 2 else { return nil }
        return top.key
    }

    public func noteLens(_ lens: AltKey) { lensPicks[lens, default: 0] += 1 }

    /// Every saved run, freshest first — what "Seus mapas" lists. The open one
    /// is in here too, a debounce behind; `maps` answers that one from live
    /// state instead.
    public internal(set) var library: [AtlasRun] = []

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
    /// The on-device mirror. What makes a relaunch paint the map the learner
    /// left open before the network has answered, and what makes a relaunch
    /// with no network show that map instead of a failure. See `LocalStore`.
    let local: LocalStore
    /// Generated content for the open run — what a screen reads instead of
    /// waiting on a model. See `Warm.swift`; it is emptied when the run
    /// changes, since every key names the run it belongs to.
    public let warm = WarmCache()

    /// The open topic's id — the address every write goes to. Nil before the
    /// first load, and while a map is being built but not yet created.
    public internal(set) var topicId: String?
    /// The open run as it was last loaded, for the fields no screen edits.
    private var loaded: AtlasRun?
    /// What the server last acknowledged, per node and per card: the baseline
    /// every debounced write diffs against. A write sends what differs from
    /// this, which is what makes a node drag one node's coordinates rather than
    /// the whole run.
    private var savedNodes: [String: String] = [:]
    private var savedCards: [String: String] = [:]
    private var savedTopic = ""
    private var savedProfile = ""
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
        api: AtlasAPI, auth: AtlasAuth, runs: RunStore? = nil, local: LocalStore? = nil,
        graph: ConceptGraph = .init(), states: StateMap = [:], subject: String = ""
    ) {
        self.api = api
        self.auth = auth
        self.local = local ?? LocalStore()
        // The same host by default: `/api/generate` and `/api/v1` are one
        // server, and letting them be configured apart is a way to point the
        // two halves of the app at different deployments by accident.
        self.runs = runs ?? RunStore(baseURL: api.baseURL)
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
        func count(_ key: String) -> Int { if case .number(let n)? = record[key] { Int(n) } else { 0 } }
        // The browser writes `checks` as `{ chunkId: true }`, one key per
        // section answered.
        let passed = (record["checks"]?.fields ?? [:]).compactMap { id, value -> String? in
            if case .bool(true) = value { id } else { nil }
        }
        return ReadingProgress(
            idx: count("idx"), total: count("total"), checks: Set(passed),
            finished: flag("finished"), handedOff: flag("handedOff")
        )
    }

    /// The phase a session on this node would open on, and so the one worth
    /// warming before the tap. Clamped short of `.retained`, which the Review
    /// tab owns and the spiral shell has no screen for.
    func owedPhase(_ node: ConceptNode) -> Phase {
        let owed = readingPhaseIndex(
            display[node.id] ?? .unknown, reviewed: reviewed.contains(node.id), reading(node.id)
        )
        return Phase.allCases[max(0, min(owed, Phase.allCases.count - 2))]
    }

    /// Write the fields this client owns into a node's record, leaving every
    /// other key the browser wrote exactly where it was. Passing nil for a
    /// field means "no news", not "false".
    func note(
        reading id: String, idx: Int? = nil, total: Int? = nil,
        finished: Bool? = nil, handedOff: Bool? = nil, passed chunk: String? = nil
    ) {
        var record = consumeProgress[id]?.fields ?? [:]
        if let idx { record["idx"] = .number(Double(idx)) }
        if let total {
            // Never downwards: a pass still streaming reports fewer sections
            // than it will end with, and a re-entry must not shrink the rail.
            let held = if case .number(let n)? = record["total"] { Int(n) } else { 0 }
            record["total"] = .number(Double(max(total, held)))
        }
        if let chunk {
            var checks = record["checks"]?.fields ?? [:]
            checks[chunk] = .bool(true)
            record["checks"] = .object(checks)
        }
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
    /// Nodes worth drafting cards for — learned at least once, no card yet.
    var uncovered: [ConceptNode] {
        graph.nodes.filter { node in
            (states[node.id] ?? .unknown).isLearned && !cards.contains { $0.nodeId == node.id }
        }
    }

    /// Load today's deck. The budget, the order and the interval on every grade
    /// button come from the server, because that is where the scheduler is.
    func loadDeck() async {
        guard let topicId, let token = await bearer() else { return }
        let budget = max(1, dailyTarget / 2)
        guard let content = try? await runs.review(
            topicId, budgetMin: budget, language: language, token: token
        ) else { return }
        deck = content.cards
        forecast = content.forecast
    }

    /// Grade a card.
    ///
    /// The card leaves today's deck immediately and the write settles behind
    /// it. Nothing on screen waits on the round trip — the next card is already
    /// up — and the next due date is the server's answer rather than a second
    /// scheduler's guess.
    func grade(_ card: ReviewCard, _ grade: ReviewGrade) {
        deck.removeAll { $0.id == card.id }
        guard let topicId else { return }
        Task {
            guard let token = await bearer() else { return }
            do {
                let graded = try await runs.grade(
                    topicId, cardId: card.id, grade: grade, token: token
                )
                // Take the scheduler's word for where the card goes next. Without
                // this the dashboard keeps counting a card the learner has just
                // answered as due, because the copy here still holds the old
                // date — and the next write would send that stale state back.
                quiet = true
                if let index = cards.firstIndex(where: { $0.id == graded.id }) {
                    cards[index] = graded
                }
                quiet = false
                savedCards[graded.id] = (try? JSONValue(encoding: graded))?.compact ?? graded.id
            } catch {
                // A grade that did not land is a card that comes back tomorrow
                // rather than one that is lost — the row still holds its old
                // due date. Worth the chip, not worth blocking the deck.
                saveFailed = true
            }
        }
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

    /// One request for everything the app draws, then open the freshest map.
    ///
    /// This used to be three: the library, then the open run's generated
    /// content, then whatever a screen asked for. The first two are one call
    /// now — a learner's whole library is a few hundred rows — and the third is
    /// narrowed to the nodes about to be shown.
    func loadLibrary() async {
        opening = true
        defer { opening = false }

        // Paint first. The mirror holds what the server last acknowledged, so a
        // relaunch draws the map the learner left open instead of a spinner —
        // and, with no signal, instead of "não foi possível carregar seus
        // mapas" over a map the phone has on disk.
        let mirrored = local.topics()
        if !mirrored.isEmpty, graph.nodes.isEmpty {
            library = mirrored
            if let freshest = mirrored.first {
                open(freshest)
                seedWarm(local.content(topicId: freshest.id))
                cachesLoaded = true
            }
            // Drawn: the shell can stop holding onboarding back, and the
            // revalidation below runs behind an interactive map.
            opening = false
        }

        guard let token = await bearer() else { return }
        guard let (profile, topics) = try? await runs.bootstrap(token: token) else {
            // Only a failure with nothing behind it is a failure the learner
            // has to be told about. With the mirror drawn, this is a refresh
            // that did not land.
            libraryFailed = mirrored.isEmpty
            return
        }
        libraryFailed = false
        library = topics
        local.replace(topics: topics)
        adopt(profile)
        guard let freshest = topics.first else { return }
        // Re-open when nothing was drawn, or when the server's copy is newer
        // than the one on disk — another device having moved the map on.
        let stale = mirrored.first.map { $0.id != freshest.id || $0.updatedAt < freshest.updatedAt } ?? true
        guard graph.nodes.isEmpty || (stale && freshest.id == topicId) else { return }
        open(freshest)
        await hydrateContent()
    }

    /// Take the learner's own row: the streak, the daily target, the reminders.
    /// One copy, rather than one per topic and a third in `UserDefaults`.
    private func adopt(_ profile: AtlasProfile) {
        let wasQuiet = quiet
        quiet = true
        defer { quiet = wasQuiet }
        dailyTarget = profile.dailyTarget
        streak = profile.adherence.streak
        lastActiveDay = profile.adherence.lastDay
        savedProfile = Self.profileShot(target: profile.dailyTarget, streak: profile.adherence.streak, day: profile.adherence.lastDay)
    }

    /// The open run's generated content — every payload the topic has, read
    /// once behind an already-drawn map and seeded into the warm cache.
    ///
    /// Nothing is ever written back. The server records content the moment it
    /// generates it, which is what retired the `caches` column this used to
    /// download whole and re-upload merged.
    private func hydrateContent() async {
        guard let topicId else { return }
        // Whatever is on disk goes in first: a phase the learner has already
        // read opens with no request at all, and with no network it opens
        // anyway.
        seedWarm(local.content(topicId: topicId))
        guard let token = await bearer(),
              let items = try? await runs.content(topicId, token: token)
        else { return }
        // The learner can have switched maps during the GET.
        guard topicId == self.topicId else { return }
        seedWarm(items)
        local.save(items, topicId: topicId)
        cachesLoaded = true
    }

    /// Point the live run at a saved one. Every write here is the store being
    /// filled in, not the learner working, so nothing is saved on the way.
    private func open(_ run: AtlasRun) {
        let wasQuiet = quiet
        quiet = true
        defer { quiet = wasQuiet }
        loaded = run
        topicId = run.id
        cachesLoaded = false
        warm.clear()
        deck = []
        forecast = []
        subject = run.subject
        graph = run.graph
        states = run.states
        shakyReasons = run.shakyReasons
        interests = run.interests
        goal = run.goal
        paretoPct = run.paretoPct
        examDate = run.examDate
        cards = run.cards
        calib = run.calibSamples
        reviewed = Set(run.reviewedNodes)
        consumeProgress = run.consumeProgress
        // Only when the topic records one: a run built before the field existed
        // has a genuinely unknown content language, and the device preference is
        // the honest fallback.
        if let language = run.language { self.language = language }
        // What the server already has, so the first debounce after an open
        // sends nothing. Without this every open would re-upload the map it
        // just finished reading.
        savedNodes = nodeShots()
        savedCards = cardShots()
        savedTopic = topicShot()
    }

    /// Create the topic a build is about to fill.
    ///
    /// Before the generation rather than after it: the server warms the new
    /// map's frontier the moment the map lands, and it needs a topic to file
    /// what it generates under. A build that produces nothing calls
    /// `abandonTopic()`.
    func createTopic(_ form: OnboardingForm) async {
        guard let token = await bearer() else { return }
        let body = JSONValue.object([
            "subject": .string(form.topic),
            "goal": .string(form.goal.rawValue),
            "interests": .string(form.interests),
            "paretoPct": .number(Double(form.paretoPct)),
            "examDate": .string(form.examDate),
            "language": .string(language),
        ])
        // Not fatal: the map still builds and still draws. What is lost is the
        // server-side warm's address, so the first phase generates on the click.
        guard let run = try? await runs.create(body, token: token) else { return }
        quiet = true
        topicId = run.id
        loaded = run
        savedNodes = [:]
        savedCards = [:]
        savedTopic = ""
        quiet = false
        library.insert(run, at: 0)
    }

    /// Undo the row above — a build that produced no map owns nothing.
    func abandonTopic() async {
        guard let id = topicId, let token = await bearer() else { return }
        topicId = nil
        loaded = nil
        library.removeAll { $0.id == id }
        local.delete(topicId: id)
        try? await runs.delete(id, token: token)
    }

    /// Open another saved map. The one being left is flushed first — switching
    /// must not be the thing that loses the last two seconds of a run.
    func switchTo(_ run: AtlasRun) async {
        guard run.id != topicId else { return }
        await saveNow()
        // Re-read rather than trusting the library's copy: it was fetched at
        // bootstrap, and a map another device has been working on should open
        // with that work on it.
        guard let token = await bearer(),
              let fresh = try? await runs.topic(run.id, token: token)
        else { return open(run) }
        open(fresh)
        await hydrateContent()
    }

    /// Start a second map. Clearing the live run is the whole trigger: the shell
    /// shows onboarding for exactly as long as there is no map, and onboarding's
    /// `finish()` creates a *new* topic. Nothing is deleted — the run left
    /// behind is a row, and stays on the dashboard.
    func newMap() async {
        await saveNow()
        quiet = true
        defer { quiet = false }
        loaded = nil
        topicId = nil
        cachesLoaded = true
        savedNodes = [:]
        savedCards = [:]
        savedTopic = ""
        clearRun()
    }

    /// Exclude a topic: one DELETE, and the foreign keys behind it take the
    /// map, the mastery states, the cards and every generated payload with it.
    /// There is no cleanup list here to keep in step with the schema — that is
    /// the whole point of the topic being the root of a cascade.
    ///
    /// The streak is deliberately untouched: it is the learner's habit, not the
    /// topic's, and it lives on their profile rather than in each run.
    ///
    /// Deleting the open map clears the live run too and opens whatever is
    /// freshest of what remains; with nothing left, the empty run is what puts
    /// the shell back on onboarding.
    func deleteMap(_ id: String) async throws {
        guard let token = await bearer() else { return }
        // Before the request, not after: the debounce is armed with writes
        // against a topic this delete is about to remove, and letting them land
        // would recreate rows under it.
        pendingSave?.cancel()
        pendingSave = nil
        // Every warmed key belongs to a topic that is about to stop existing,
        // and a generation still in flight is spend on content nobody will see.
        if id == topicId { warm.clear() }
        try await runs.delete(id, token: token)
        // The local half of the cascade the foreign keys make on the server.
        local.delete(topicId: id)
        library.removeAll { $0.id == id }
        guard id == topicId else { return }
        quiet = true
        loaded = nil
        topicId = nil
        cachesLoaded = true
        savedNodes = [:]
        savedCards = [:]
        savedTopic = ""
        clearRun()
        quiet = false
        if let next = library.first {
            open(next)
            await hydrateContent()
        }
    }

    /// The dashboard's list: every saved map, with the open one answered from
    /// live state rather than from its row, which is a debounce behind.
    var maps: [AtlasRun] {
        guard let topicId, let index = library.firstIndex(where: { $0.id == topicId })
        else { return library }
        var maps = library
        maps[index].subject = subject
        maps[index].graph = graph
        maps[index].states = states
        return maps
    }

    /// How many cards are due right now — the dashboard's count.
    ///
    /// Read from the stored due date rather than from a local scheduler: the
    /// scheduling itself is the server's, and this only asks whether a date has
    /// passed. `deck` is the ordered, budgeted answer, and Review asks for it.
    var dueCount: Int {
        let now = Date.now
        return cards.count { card in
            guard case .string(let due)? = card.fsrs.fields?["due"],
                  let date = ISODate.parse(due)
            else { return true }
            return date <= now
        }
    }

    // MARK: - What a write compares against
    //
    // A node, a card, the topic's own fields and the profile, each reduced to
    // the JSON of exactly what is persisted about it. Comparing strings is what
    // makes the diff one line per row rather than a field-by-field equality
    // function that has to be updated every time a column is added — and a
    // string that differs is, by construction, a row that has to be written.

    private func nodeShots() -> [String: String] {
        var shots: [String: String] = [:]
        for node in graph.nodes {
            let fields: [String: JSONValue] = [
                "label": .string(node.label),
                "summary": node.summary.map(JSONValue.string) ?? .null,
                "g": .number(Double(node.g)),
                "week": .number(Double(node.week)),
                "x": .number(node.x),
                "y": .number(node.y),
                "isGap": .bool(node.gap == true),
                // `frontier` is derived from the prerequisites on every read, in
                // both clients, and never lands in `StateMap` — so this is a
                // straight copy with the node's generated seed as the fallback.
                "state": .string((states[node.id] ?? node.state).rawValue),
                "shakyReason": shakyReasons[node.id].map { .string($0.rawValue) } ?? .null,
                "reviewed": .bool(reviewed.contains(node.id)),
                "consumeProgress": consumeProgress[node.id] ?? .null,
            ]
            shots[node.id] = JSONValue.object(fields).compact
        }
        return shots
    }

    private func cardShots() -> [String: String] {
        var shots: [String: String] = [:]
        for card in cards { shots[card.id] = (try? JSONValue(encoding: card))?.compact ?? card.id }
        return shots
    }

    private func topicShot() -> String {
        JSONValue.object([
            "goal": .string(goal.rawValue),
            "interests": .string(interests),
            "paretoPct": .number(Double(paretoPct)),
            "examDate": .string(examDate),
            "language": .string(language),
            "calibSamples": (try? JSONValue(encoding: calib)) ?? .array([]),
        ]).compact
    }

    private static func profileShot(target: Int, streak: Int, day: String) -> String {
        JSONValue.object([
            "dailyTarget": .number(Double(target)),
            "streak": .number(Double(streak)),
            "lastDay": .string(day),
        ]).compact
    }

    /// Persist the open run a beat after the last change. Every write the
    /// learner makes lands here — a graded card, a spawned gap, a settings tap
    /// — so the debounce is what keeps a session from being one request per tap.
    private func saveSoon() {
        guard !quiet, signedIn else { return }
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
            // write it had just started and dropped it on the floor.
            pendingSave = nil
            await saveNow()
        }
    }

    /// Write what changed.
    ///
    /// The whole run used to go up on every tick, which is why the generated
    /// content had to be split into a second column on a longer debounce so a
    /// node drag would stop re-uploading every section the learner had read.
    /// Neither is needed now: content is never uploaded at all, and this sends
    /// a payload the size of what actually moved.
    ///
    /// A failure is kept — `saveFailed` draws the chip and a retry is armed, so
    /// a session worked through offline lands as soon as there is signal.
    func saveNow() async {
        pendingSave?.cancel()
        pendingSave = nil
        guard signedIn, var token = await bearer() else { return }

        let profile = Self.profileShot(target: dailyTarget, streak: streak, day: lastActiveDay)
        let nodes = nodeShots()
        let cardsNow = cardShots()
        let topic = topicShot()

        do {
            if profile != savedProfile {
                try await runs.patchProfile(.object([
                    "dailyTarget": .number(Double(dailyTarget)),
                    "language": .string(language),
                    "adherence": .object([
                        "streak": .number(Double(streak)),
                        "lastDay": .string(lastActiveDay),
                    ]),
                ]), token: token)
                savedProfile = profile
            }
            guard let topicId else { return }

            var deltas: [NodeDelta] = []
            for node in graph.nodes where savedNodes[node.id] != nodes[node.id] {
                var delta = NodeDelta(id: node.id)
                delta.label = node.label
                delta.summary = node.summary
                delta.g = node.g
                delta.week = node.week
                delta.x = node.x
                delta.y = node.y
                delta.isGap = node.gap == true
                delta.state = states[node.id] ?? node.state
                delta.shakyReason = .some(shakyReasons[node.id])
                delta.reviewed = reviewed.contains(node.id)
                delta.consumeProgress = consumeProgress[node.id]
                // Only a node the server has never seen needs its edges; an
                // existing one's prerequisites are already rows, and re-sending
                // them on every drag would be the write amplification this
                // whole change replaced.
                if savedNodes[node.id] == nil {
                    delta.prereqs = graph.edges.filter { $0.to == node.id }.map(\.from)
                }
                deltas.append(delta)
            }
            let removed = savedNodes.keys.filter { nodes[$0] == nil }
            if !deltas.isEmpty || !removed.isEmpty {
                try await runs.patchNodes(topicId, deltas: deltas, remove: Array(removed), token: token)
                savedNodes = nodes
            }

            let changed = cards.filter { savedCards[$0.id] != cardsNow[$0.id] }
            if !changed.isEmpty {
                try await runs.putCards(topicId, cards: changed, token: token)
                savedCards = cardsNow
            }

            if topic != savedTopic {
                try await runs.patchTopic(topicId, body: .object([
                    "goal": .string(goal.rawValue),
                    "interests": .string(interests),
                    "paretoPct": .number(Double(paretoPct)),
                    "examDate": .string(examDate),
                    "language": .string(language),
                    "calibSamples": (try? JSONValue(encoding: calib)) ?? .array([]),
                ]), token: token)
                savedTopic = topic
            }
        } catch {
            // A 401 means the token died between the check above and the write.
            // Renewing and arming a retry is the difference between a save that
            // lands and an afternoon of work nobody knows is unsaved.
            if (error as? AtlasError)?.code == "auth", let renewed = await bearer(renew: true) {
                token = renewed
            }
            saveFailed = true
            saveIn(15)
            return
        }
        saveFailed = false
        // The learner can have signed out — or signed in as somebody else —
        // while those writes were in flight.
        guard session?.accessToken == token else { return }
        if let index = library.firstIndex(where: { $0.id == topicId }) {
            library[index].subject = subject
            library[index].graph = graph
            library[index].states = states
            library[index].cards = cards
            library[index].shakyReasons = shakyReasons
            library[index].reviewedNodes = reviewed.sorted()
            library[index].consumeProgress = consumeProgress
            library[index].calibSamples = calib
            // The mirror holds what the server acknowledged, never what the
            // screen hopes it did — so it is written here, after the write
            // landed, and not beside the state change that caused it.
            local.save(library[index])
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
        topicId = nil
        library = []
        // The map belongs to the learner who signed in, not to the device — and
        // that is true of the mirror on disk too. The next person to hold this
        // phone must not open somebody else's map.
        local.clear()
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
