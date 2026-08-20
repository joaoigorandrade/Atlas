import Observation
import SwiftUI

/// Everything persisted about a run — the graph, the mastery states, the cached
/// generations. One owner, mirroring `useRunState` on the web: a screen reads
/// this and writes back through it, and never keeps a second copy of a node's
/// state.
@Observable
@MainActor
public final class AtlasStore {
    public var graph: ConceptGraph
    public var states: StateMap
    public var subject: String
    /// What the learner said they care about, from onboarding. Every generated
    /// kind keys on it, so it travels with the run rather than the screen.
    public var interests = ""

    /// Every review card ever drafted for this run, with its scheduler state.
    /// The generation is a card factory; this is the queue it feeds.
    public var cards: [ScheduledCard] = []
    /// Confidence-vs-performance readings, one per node, screen 20's whole
    /// content. Written by the confidence tap before each card is flipped.
    public var calib: [CalibSample] = []
    /// Nodes with a real review behind them — what earns Retido, since being
    /// Mastered alone doesn't (`phaseIndex`).
    public var reviewed: Set<String> = []

    // The four settings screen 13 owns, plus the streak the header reads.
    // UserDefaults because a preference that forgets itself on relaunch is a
    // bug; the run itself still lives only in memory (no `run_states` sync yet).
    public var goal: GoalKind = Defaults.goal { didSet { Defaults.goal = goal } }
    public var dailyTarget: Int = Defaults.dailyTarget { didSet { Defaults.dailyTarget = dailyTarget } }
    public var dictationOn: Bool = Defaults.dictationOn { didSet { Defaults.dictationOn = dictationOn } }
    public var readAloudOn: Bool = Defaults.readAloudOn { didSet { Defaults.readAloudOn = readAloudOn } }
    /// The language generated content comes back in. The interface follows the
    /// device (the String Catalog); this is the one the model is told.
    public var language: String = Defaults.language {
        didSet { AtlasAPI.language = language; Defaults.language = language }
    }

    /// Consecutive days with work on them.
    /// ponytail: any work counts, and a missed day resets it. The forgiving
    /// freeze and the minutes-met rule live in `lib/curriculum/adherence.ts`
    /// and are a phase of their own.
    public private(set) var streak: Int = Defaults.streak
    private var lastActiveDay: String = Defaults.lastActiveDay

    public let api: AtlasAPI
    public let auth: AtlasAuth

    /// The signed-in learner, or nil for the auth screens. Writing it is the one
    /// way the bearer token reaches `AtlasAPI` and the keychain.
    public private(set) var session: AuthSession?

    public init(api: AtlasAPI, auth: AtlasAuth, graph: ConceptGraph = .init(), states: StateMap = [:], subject: String = "") {
        self.api = api
        self.auth = auth
        self.graph = graph
        self.states = states
        self.subject = subject
        // The stored preference is the one the model is told, from launch.
        AtlasAPI.language = language
    }

    /// What each node displays as, frontier included. The only way a surface
    /// asks about a node's state.
    public var display: [String: NodeState] { displayStates(states, graph) }

    public var frontier: [ConceptNode] {
        let shown = display
        return graph.nodes.filter { shown[$0.id] == .frontier }
    }

    /// Share of the map learned at least once — the "território dominado" figure.
    public var mastered: Double {
        guard !graph.nodes.isEmpty else { return 0 }
        return Double(masteredCount) / Double(graph.nodes.count)
    }

    public var masteredCount: Int {
        graph.nodes.filter { (states[$0.id] ?? .unknown) == .mastered }.count
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

/// The handful of preferences that outlive a launch. Not a settings framework —
/// five keys and the reads that seed the store.
enum Defaults {
    static var goal: GoalKind {
        get { GoalKind(rawValue: UserDefaults.standard.string(forKey: "goal") ?? "") ?? .exam }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "goal") }
    }
    static var dailyTarget: Int {
        get { dailyTargets.contains(UserDefaults.standard.integer(forKey: "dailyTarget")) ? UserDefaults.standard.integer(forKey: "dailyTarget") : 15 }
        set { UserDefaults.standard.set(newValue, forKey: "dailyTarget") }
    }
    static var language: String {
        get { UserDefaults.standard.string(forKey: "language") ?? AtlasAPI.deviceLanguage }
        set { UserDefaults.standard.set(newValue, forKey: "language") }
    }
    static var dictationOn: Bool {
        get { UserDefaults.standard.object(forKey: "dictation") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "dictation") }
    }
    static var readAloudOn: Bool {
        get { UserDefaults.standard.object(forKey: "readAloud") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "readAloud") }
    }
    static var streak: Int {
        get { UserDefaults.standard.integer(forKey: "streak") }
        set { UserDefaults.standard.set(newValue, forKey: "streak") }
    }
    static var lastActiveDay: String {
        get { UserDefaults.standard.string(forKey: "lastActiveDay") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "lastActiveDay") }
    }
}

// MARK: - Session

public extension AtlasStore {
    var signedIn: Bool { session != nil }

    /// Launch: pick the stored session back up, renewing it if it has aged out.
    /// ponytail: refreshed at launch only — a token that expires mid-run lands
    /// the learner on the auth screen. Refresh on a 401 when runs outlive an hour.
    func restore() async {
        if Fixtures.enabled { return adoptFixtures() }
        guard let stored = SessionStore.load() else { return }
        guard stored.isExpired else { return await adopt(stored) }
        if let renewed = try? await auth.refresh(stored.refreshToken) {
            await adopt(renewed)
        } else {
            signOut()
        }
    }

    func signIn(email: String, password: String) async throws {
        await adopt(try await auth.signIn(email: email, password: password))
    }

    /// `false` means Supabase sent a confirmation email — screen 3, not a session.
    func signUp(email: String, password: String) async throws -> Bool {
        guard let session = try await auth.signUp(email: email, password: password) else { return false }
        await adopt(session)
        return true
    }

    func signOut() {
        session = nil
        // The map belongs to the learner who signed in, not to the device.
        graph = ConceptGraph()
        states = [:]
        subject = ""
        interests = ""
        cards = []
        calib = []
        reviewed = []
        SessionStore.save(nil)
        Task { await api.setAccessToken(nil) }
    }

    /// `ATLAS_FIXTURES=1` boots straight into a demo run: the map and the node
    /// sheet are buildable before onboarding exists to produce a real graph.
    private func adoptFixtures() {
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
