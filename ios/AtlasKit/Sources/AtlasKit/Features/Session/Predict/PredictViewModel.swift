import Observation
import SwiftUI

/// Predict's state: how sure they are, said first, then the forecast, and only
/// then what actually happened.
///
/// Its own model, and the confidence half is why. No other phase in the
/// catalogue takes a reading *before* the commit and holds it against the
/// outcome — that pairing is what separates a mechanism you trust and that does
/// not hold from one you were unsure of, and it feeds the same calibration curve
/// the Crucible's tap does.
@Observable
@MainActor
final class PredictViewModel {
    private(set) var session: PredictSession
    private(set) var writing = true
    private(set) var message = ""

    private let pass: SessionViewModel

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = PredictSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: PredictContent? { pass.store.setups(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Montando situações para prever…") : message
    }

    var current: PredictSetup? { content?.setups[safe: session.index] }
    var forecast: Int? { current.flatMap { session.forecasts[$0.id] } }
    /// How sure they said they were on the open setup, or nil while unrated.
    var sureness: Int? { current.flatMap { session.sureness[$0.id] } }
    /// The outcomes stay off screen until a confidence is on record. A learner
    /// who reads the options first is rating a guess they have already made.
    var canForecast: Bool { sureness != nil }
    var settled: Bool { forecast != nil }
    var reported: Bool { session.done }

    var total: Int { content?.setups.count ?? 0 }
    var score: Int { content.map(session.score) ?? 0 }
    var overconfident: [PredictSetup] { content.map(session.overconfident) ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }

    var rail: [Color?] {
        guard let content else { return [] }
        return content.setups.map { setup in
            guard let call = session.forecasts[setup.id] else { return nil }
            return call == setup.answerIndex ? NodeState.mastered.color : NodeState.shaky.color
        }
    }

    /// Least → most sure, as the web's `PREDICT_CONFIDENCE` orders them.
    static func levelLabel(_ level: Int) -> LocalizedStringKey {
        switch level {
        case 0: "Chutando"
        case 1: "Bem confiante"
        default: "Certeza"
        }
    }

    func mark(_ index: Int) -> ChoiceMark {
        guard let current, let forecast else { return .unmarked }
        if index == current.answerIndex { return .right }
        return index == forecast ? .wrong : .unmarked
    }

    func sure(_ level: Int) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.sure(level, content) }
    }

    func commit(_ index: Int) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.commit(index, content) }
    }

    func next() {
        guard let content else { return }
        withAnimation(Motion.enter) { session.next(content) }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.predict(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar as situações"))
        }
        writing = false
    }

    /// Leave for the next rung, and file the confidence readings on the way.
    /// They are the same currency screen 20 plots: what the learner said they
    /// knew against what the forecast actually did.
    func advance() {
        if let content {
            for reading in session.calibration(content) {
                pass.store.recordCalib(node.id, felt: reading.felt, real: reading.real)
            }
        }
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
