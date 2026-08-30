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
    /// The stream died after concepts had landed: the fork keeps the partial
    /// map and offers to build it again rather than throwing the wait away.
    public private(set) var mapIncomplete = false

    /// The placement is opt-in: nothing is asked until the fork is answered.
    public private(set) var takingPlacement = false
    /// The first question never arrived. The fork keeps the map and drops the
    /// offer rather than sending the learner into a test that cannot be asked.
    public private(set) var placementUnavailable = false
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
    /// The placement question asked for while the map was still streaming. Held
    /// so it can be cancelled with the build — a question nobody will ever see
    /// is a model call nobody is paying for on purpose.
    private var pending: Task<DiagnosticQuestion, Error>?
    /// The follow-up question being written while a verdict is on screen. Held
    /// for the same reason as `pending`: "Pular" must not leave a model call
    /// running whose result lands on a view model the shell already replaced.
    private var followUp: Task<Void, Never>?
    /// The placement ended early — an exhausted pool or a writer that stumbled.
    /// Kept apart from `answered` so the rail keeps saying what the learner
    /// actually did instead of lighting five segments after two answers.
    private var stopped = false
    private var pendingGaps: [(parent: String, spec: GapSpec)] = []
    /// Why the placement flipped each node Shaky. Committed with the states so
    /// the drawer can say what the miss was, exactly as the web does.
    private var shakyReasons: [String: ShakyReason] = [:]
    /// The run has been handed to the store. `finish()` is reachable from more
    /// than one dock button, and the second call must not upsert a second time
    /// over a run the learner has already started working in.
    private var committed = false
    /// A set, not a list: the pool filter below asks it once per node on the
    /// map, after every answer.
    private var asked: Set<String> = []
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

    /// Fewest concepts that count as a map. Mirrors `mapNodeBounds().min` on the
    /// server (4 is the Pareto floor): below this the stream was truncated, not
    /// short, and committing it parks the shell on an empty map with no way out.
    static let mapMinimum = 4

    // MARK: - Screen 6, the build

    public func buildMap() {
        let topic = normalizedTopic(form.topic)
        guard !topic.isEmpty else {
            message = String(localized: "Diga primeiro o que você quer aprender.")
            return
        }
        // The subject is half the run row's primary key and `finish()` upserts
        // on it with no loaded row behind it: building a second "Cálculo I"
        // would replace the first one's cards, calibration and caches with
        // empties. Caught here rather than at the commit — it is knowable
        // before a map is paid for, and the topic field is where it is fixable.
        guard !store.library.contains(where: { $0.subject == topic }) else {
            message = String(localized: "Você já tem um mapa de \(topic). Abra-o em Seus mapas, ou escolha outro nome.")
            return
        }
        form.topic = topic
        // A re-submit (or a picked scope) starts a second stream: cancelling
        // the first is what stops its concepts landing on the new map.
        stopBuilding()
        stage = .building
        graph = ConceptGraph()
        states = [:]
        scopes = []
        message = ""
        questions = []
        answered = 0
        verdict = nil
        takingPlacement = false
        placementUnavailable = false
        mapIncomplete = false
        pendingGaps = []
        shakyReasons = [:]
        committed = false
        asked = []
        stopped = false
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
                        pending?.cancel()
                        stage = .welcome
                        return
                    }
                }
            } catch {
                message = ErrorCopy.sentence(for: error, doing: String(localized: "montar seu mapa"))
                // A stream that died at concept 18 of 20 still left a real map:
                // keep what landed and let the fork offer another build.
                guard graph.nodes.count >= Self.mapMinimum else {
                    pending?.cancel()
                    stage = .welcome
                    return
                }
                mapIncomplete = true
            }
            guard !Task.isCancelled else { return }
            // A stream that ended clean but empty (or truncated to two or three
            // concepts) is not a finished map, and "Seu mapa está pronto." over
            // it is a lie the learner cannot back out of.
            guard graph.nodes.count >= Self.mapMinimum else {
                pending?.cancel()
                message = String(localized: "Seu mapa não ficou pronto. Tente de novo.")
                stage = .welcome
                return
            }
            // Short map, or a stream that ended before the overlap fired.
            let question = first ?? ask()
            // The fork opens on its own — a learner who wants the map should not
            // wait on a test they are about to skip. The question lands behind it.
            let left = Self.buildFloor - opened.duration(to: .now)
            if left > .zero { try? await Task.sleep(for: left) }
            guard !Task.isCancelled else { return }
            stage = .placement
            do {
                questions = [try await question.value]
            } catch {
                // A skip cancels this await mid-flight. That is the learner's
                // decision, not a failure, and must not be reported as one.
                guard !Task.isCancelled, !(error is CancellationError) else { return }
                // Placement is a nice-to-have; the map is the product. Stay on
                // the fork and say why the step is missing — `finish()` here
                // would swap the shell to the map in the same turn and the
                // sentence would be torn down before it was ever read.
                message = ErrorCopy.sentence(for: error, doing: String(localized: "preparar o nivelamento"))
                placementUnavailable = true
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
    public var placementDone: Bool { takingPlacement && noMoreQuestions && verdict == nil }
    /// No further question is coming: the rail is full, the pool ran dry, or the
    /// writer stumbled. What the dock's last CTA reads off.
    public var noMoreQuestions: Bool { stopped || answered >= total }

    // MARK: - Copy and rails the placement screen draws

    public var rail: [Color?] { (0..<total).map { $0 < answered ? Palette.accent : nil } }
    /// The rail is bare capsules; without this a VoiceOver user has no idea
    /// where they are in the five questions.
    public var railLabel: String {
        String(localized: "Pergunta \(min(answered + 1, total)) de \(total)")
    }

    public var forkBody: LocalizedStringKey {
        if placementDone {
            return "Podamos o que você já domina e acendemos sua fronteira — os conceitos que você está pronto para aprender agora."
        }
        if placementUnavailable {
            return "O nivelamento não ficou pronto desta vez. Seu mapa está — siga por ele e marque o que já sabe pelo caminho."
        }
        return "Quer um nivelamento rápido antes? \(diagnosticCount) perguntas adaptativas podam o que você já sabe e acendem sua fronteira real. Opcional — você pode ir direto."
    }

    public var verdictKicker: LocalizedStringKey? {
        guard let verdict else { return nil }
        return verdict.correct ? "Correto" : (verdict.slipped ? "Quase lá — contado como escorregão" : "Quase lá")
    }

    public var verdictTint: Color { verdict?.correct == true ? Palette.accent : Palette.amberInk }

    /// The truth about what was written to the map — a discounted slip pruned
    /// the concept rather than adding to it, and saying otherwise describes a
    /// map the learner doesn't have.
    public var verdictBody: LocalizedStringKey? {
        guard let verdict else { return nil }
        let tag = verdict.question.tag
        // A malformed `correctIndex` is the model's mistake, not the learner's:
        // say the rest and leave the answer out rather than trapping.
        let answer = verdict.question.opts[safe: verdict.question.correctIndex]?.label ?? ""
        if verdict.correct { return "\(tag) e tudo abaixo dele foi marcado como sabido." }
        return verdict.slipped
            ? "A resposta: \(answer)\nVocê acertou perguntas mais difíceis, então \(tag) continua marcado como sabido — nada foi adicionado ao seu mapa."
            : "A resposta: \(answer)\nVamos encaixar \(tag) no seu mapa."
    }

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
        if effect == .shaky {
            shakyReasons[question.nodeId] = .diagnosticHesitation
            if let gap = question.gap { pendingGaps.append((question.nodeId, gap)) }
        }
        asked.insert(question.nodeId)
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
            stopped = true
            return
        }
        followUp = Task {
            do {
                questions.append(try await store.api.diagnosticQuestion(
                    form, pool: pool, difficulty: nextDifficulty
                ))
            } catch {
                // The writer stumbled mid-placement: stop asking and let what is
                // already known stand — and say so, rather than looking like the
                // app decided it had learned enough about them.
                guard !Task.isCancelled, !(error is CancellationError) else { return }
                stopped = true
                message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever a próxima pergunta"))
            }
        }
    }

    /// "Próxima pergunta →" — the verdict is read, the next question takes over.
    public func next() { verdict = nil }

    /// Commit the run: the map, everything the placement wrote, and the gap
    /// nodes its misses split out. The one write that ends onboarding.
    public func finish() {
        guard !committed else { return }
        // The invariant this class claims: nothing half-built reaches the store.
        // `RootView` switches on `graph.nodes.isEmpty` as a *transition*, so an
        // empty commit leaves onboarding parked with every button a no-op — and
        // `subject` alone is enough to upsert a junk row.
        guard graph.nodes.count >= Self.mapMinimum else {
            message = String(localized: "Seu mapa não ficou pronto. Tente de novo.")
            stage = .welcome
            stopBuilding()
            return
        }
        stopBuilding()
        committed = true
        var map = graph
        for gap in pendingGaps {
            map = spawnGap(map, parentId: gap.parent, gap.spec)
            // `spawnGap` writes `.gap` onto the node value, but no surface reads
            // it there — `displayStates` starts from the state map, and a gap
            // missing from it paints grey and reads "Bloqueado". Written before
            // the commit below, which is the only write of `states`.
            if map.nodes.contains(where: { $0.id == gap.spec.id }) { states[gap.spec.id] = .gap }
        }
        store.graph = map
        store.states = states
        store.shakyReasons = shakyReasons
        // Normalised, because `subject` is half the row's primary key and the web
        // app writes `form.topic.trim()`: a topic typed with a stray space here
        // would open a second row the browser never joins.
        store.subject = normalizedTopic(form.topic)
        store.interests = form.interests
        // What the run is for, and how long a day is, outlive onboarding —
        // screens 12 and 13 read them, and screen 13 is where they change.
        store.goal = form.goal
        store.dailyTarget = form.target
        // Neither has a screen on the phone yet; both are the browser's, and a
        // row this client writes first has to carry them or they are lost.
        store.paretoPct = form.paretoPct
        store.examDate = form.examDate
        // A fresh map is generated in the interface language, so this is the one
        // moment the run's content language is known for certain. `AtlasStore`
        // only stamps it when nothing was loaded, which is true here by luck
        // rather than by design — say it out loud instead.
        store.language = AtlasAPI.language
    }

    private func ask() -> Task<DiagnosticQuestion, Error> {
        pending?.cancel()
        let task = Task { [form, api = store.api, difficulty = nextDifficulty, nodes = graph.nodes] in
            let fetch = { try await api.diagnosticQuestion(form, pool: nodes, difficulty: difficulty) }
            // Never cached — its node ids did not exist until the map above
            // resolved — so it flakes more often than a warmed call. One retry
            // before giving up on the learner's very first question.
            do { return try await fetch() } catch {
                try Task.checkCancellation()
                return try await fetch()
            }
        }
        pending = task
        return task
    }

    /// The map stream and the question riding alongside it, stopped together.
    private func stopBuilding() {
        build?.cancel()
        pending?.cancel()
        followUp?.cancel()
    }

}
