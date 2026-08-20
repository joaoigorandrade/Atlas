import Observation
import SwiftUI

/// Screens 5–8, as one state machine: topic in, map out, placement answered.
///
/// It owns the run it is building — the graph, the mastery states, the pending
/// gaps — and commits all of it to `AtlasStore` in one write at `finish()`.
/// Nothing half-built reaches the store, so the shell shows onboarding for
/// exactly as long as there is no map, and the map screen never paints a
/// stream in progress.
@Observable
@MainActor
public final class OnboardingViewModel {
    public enum Stage { case welcome, building, placement }

    public private(set) var stage: Stage = .welcome
    public var form = OnboardingForm()

    /// The map as it assembles, and the count screen 6 reads out. Indeterminate
    /// waits read ~30% longer than determinate ones, and this one has real
    /// frames to count.
    public private(set) var graph = ConceptGraph()
    public private(set) var states: StateMap = [:]
    /// Sub-map offers when the topic was a continent, not a map.
    public private(set) var scopes: [AtlasAPI.ScopeOffer] = []
    /// Honest failure copy, shown where the learner is — never an alert.
    public private(set) var message = ""

    /// The placement is opt-in: nothing is asked until the fork is answered.
    public private(set) var takingPlacement = false
    public private(set) var questions: [DiagnosticQuestion] = []
    public private(set) var answered = 0
    /// The question just answered, held so its verdict can be read before the
    /// next one replaces it.
    public private(set) var verdict: Verdict?

    public struct Verdict: Sendable {
        public let question: DiagnosticQuestion
        public let picked: Int
        public let effect: DiagnosticEffect
        public var correct: Bool { picked == question.correctIndex }
        /// A miss the placement discounted: wrong, but it wrote back as known.
        public var slipped: Bool { !correct && effect == .mastered }
    }

    private let store: AtlasStore
    private var build: Task<Void, Never>?
    private var pendingGaps: [(parent: String, spec: GapSpec)] = []
    private var asked: [String] = []
    private var nextDifficulty: DiagnosticDifficulty = .medium
    private var maxCorrect: DiagnosticDifficulty?

    public init(store: AtlasStore) { self.store = store }

    /// Minimum time the assembly beat plays. A floor, not a target: SPEC §2
    /// calls it a deliberate "this is mine" moment, not a spinner to minimise.
    static let buildFloor = Duration.seconds(2.6)

    /// Concepts that must have landed before the first placement question is
    /// asked for. The map arrives foundations-first, so this prefix is exactly
    /// what an opening question should probe — and asking here overlaps the two
    /// cold generations instead of serialising them.
    static let poolMinimum = 8

    // MARK: - Screen 6, the build

    public func buildMap() {
        let topic = form.topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !topic.isEmpty else {
            message = "Diga primeiro o que você quer aprender."
            return
        }
        form.topic = topic
        // A re-submit (or a picked scope) starts a second stream: cancelling
        // the first is what stops its concepts landing on the new map.
        build?.cancel()
        stage = .building
        graph = ConceptGraph()
        states = [:]
        scopes = []
        message = ""
        questions = []
        answered = 0
        verdict = nil
        takingPlacement = false
        pendingGaps = []
        asked = []
        nextDifficulty = .medium
        maxCorrect = nil

        build = Task { [form] in
            let opened = ContinuousClock.now
            var first: Task<DiagnosticQuestion, Error>?
            do {
                for try await event in await store.api.curriculum(form) {
                    switch event {
                    case .nodes(let nodes):
                        graph = graphFromMapNodes(nodes)
                        states = initialStates(graph)
                        if first == nil, nodes.count >= Self.poolMinimum { first = ask() }
                    case .scopes(let offers):
                        // Too broad for one map: back to the welcome screen with
                        // territories to pick from.
                        scopes = offers
                        stage = .welcome
                        return
                    }
                }
            } catch {
                stage = .welcome
                message = ErrorCopy.sentence(for: error, doing: "montar seu mapa")
                return
            }
            guard !Task.isCancelled else { return }
            // Short map, or a stream that ended before the overlap fired.
            let pending = first ?? ask()
            // The fork opens on its own — a learner who wants the map should not
            // wait on a test they are about to skip. The question lands behind it.
            try? await Task.sleep(for: Self.buildFloor - opened.duration(to: .now))
            stage = .placement
            do {
                questions = [try await pending.value]
            } catch {
                // Placement is a nice-to-have; the map is the product. Open it,
                // but say why the step is missing.
                message = ErrorCopy.sentence(for: error, doing: "preparar o nivelamento")
                finish()
            }
        }
    }

    /// A picked scope becomes the topic and builds immediately.
    public func pick(_ scope: AtlasAPI.ScopeOffer) {
        form.topic = scope.label
        scopes = []
        buildMap()
    }

    // MARK: - Screens 7 and 8, the placement

    public func takePlacement() { takingPlacement = true }

    public var total: Int { max(diagnosticCount, questions.count) }
    /// The question on screen, or nil while the writer is still writing it.
    public var question: DiagnosticQuestion? { verdict?.question ?? questions[safe: answered] }
    public var placementDone: Bool { takingPlacement && answered >= total && verdict == nil }

    /// Grade an answer and write it to the map. Every effect runs here, in the
    /// event handler, so the pool below filters on the post-answer truth.
    public func answer(_ index: Int) {
        guard verdict == nil, let question = questions[safe: answered] else { return }
        let correct = index == question.correctIndex
        let effect = diagnosticEffect(question.difficulty, correct: correct, maxCorrect: maxCorrect)
        let ladder = DiagnosticDifficulty.allCases
        if correct,
           maxCorrect == nil || ladder.firstIndex(of: question.difficulty)! > ladder.firstIndex(of: maxCorrect!)! {
            maxCorrect = question.difficulty
        }
        states = applyDiagnosticEffect(states, effect, nodeId: question.nodeId, edges: graph.edges)
        if effect == .shaky, let gap = question.gap {
            pendingGaps.append((question.nodeId, gap))
        }
        asked.append(question.nodeId)
        // A discounted miss is noise, not a signal — it must not walk the ladder
        // down either. Hold the level.
        nextDifficulty = !correct && effect == .mastered
            ? question.difficulty
            : stepDifficulty(question.difficulty, correct: correct)
        answered += 1
        verdict = Verdict(question: question, picked: index, effect: effect)
        guard answered < diagnosticCount else { return }

        // Already-asked nodes are out, and so is everything these answers
        // pruned: re-probing settled territory spends a question to learn
        // nothing, and a miss there would undo a prune.
        let pool = graph.nodes.filter { !asked.contains($0.id) && states[$0.id] != .mastered }
        guard !pool.isEmpty else {
            answered = diagnosticCount
            return
        }
        Task {
            do {
                questions.append(try await store.api.diagnosticQuestion(
                    form, pool: pool, difficulty: nextDifficulty
                ))
            } catch {
                // The writer stumbled mid-placement: stop asking and let what is
                // already known stand — and say so, rather than looking like the
                // app decided it had learned enough about them.
                answered = diagnosticCount
                message = ErrorCopy.sentence(for: error, doing: "escrever a próxima pergunta")
            }
        }
    }

    /// "Próxima pergunta →" — the verdict is read, the next question takes over.
    public func next() { verdict = nil }

    /// Commit the run: the map, everything the placement wrote, and the gap
    /// nodes its misses split out. The one write that ends onboarding.
    public func finish() {
        build?.cancel()
        var map = graph
        for gap in pendingGaps { map = spawnGap(map, parentId: gap.parent, gap.spec) }
        store.graph = map
        store.states = states
        store.subject = form.topic
        store.interests = form.interests
        // What the run is for, and how long a day is, outlive onboarding —
        // screens 12 and 13 read them, and screen 13 is where they change.
        store.goal = form.goal
        store.dailyTarget = form.target
    }

    private func ask() -> Task<DiagnosticQuestion, Error> {
        Task { [form, difficulty = nextDifficulty, nodes = graph.nodes] in
            try await store.api.diagnosticQuestion(form, pool: nodes, difficulty: difficulty)
        }
    }

}
