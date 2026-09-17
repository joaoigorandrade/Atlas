import Foundation
import Testing
@testable import AtlasKit

// The domain-shaped placement probes and the checker that rules on them.
//
// This whole file exists because the probes shipped unreachable: the client
// never asked for a domain, so every placement — for a language, for linear
// algebra, for church history — was a four-option recognition question, and the
// decode would have thrown on the first shaped one it was ever sent.

// MARK: - The checker

@Test func aNumberIsTheSameNumberHoweverItIsWritten() {
    // A fraction, a decimal, a percentage and a comma decimal are one answer.
    #expect(checkNumeric("0.75", "3/4"))
    #expect(checkNumeric("75%", "3/4"))
    #expect(checkNumeric("0,75", "3/4"))
    #expect(checkNumeric("3/4", "0.75"))
    // Labelled with the unit the question already fixed.
    #expect(checkNumeric("12cm", "12"))
    #expect(checkNumeric("$40", "40"))
    // pt-BR is a shipped language, so its currency has to come off too — the
    // web's regex named an uppercase R after lowercasing, so it never did.
    #expect(checkNumeric("R$ 40", "40"))
    // Scientific notation, both spellings.
    #expect(checkNumeric("3x10^2", "300"))
    #expect(checkNumeric("3e2", "300"))
}

@Test func theToleranceIsTightEnoughToBeWorthSomething() {
    // 0.5% relative: 0.333 is 1/3, 0.33 is a learner who rounded too early.
    #expect(checkNumeric("0.333", "1/3"))
    #expect(!checkNumeric("0.33", "1/3"))
    // Relative error is undefined at zero, so the tolerance goes absolute.
    #expect(checkNumeric("0.001", "0"))
    #expect(!checkNumeric("0.1", "0"))
}

@Test func whatIsNotANumberIsNotAnAnswer() {
    #expect(parseNumber("") == nil)
    #expect(parseNumber("about four") == nil)
    #expect(parseNumber("3/0") == nil)
    // Never graded right by accident: a non-answer must not match a non-answer.
    #expect(!checkNumeric("", ""))
}

@Test func aSpokenAnswerIsItsWordsAndTheirOrder() {
    // Dictation has no control over accents or punctuation, so neither counts.
    #expect(checkText("Está na mesa", ["esta na mesa"]))
    #expect(checkText("  ESTÁ,  na mesa! ", ["está na mesa"]))
    // Any one of the accepted phrasings is the answer.
    #expect(checkText("no problem", ["de nada", "no problem"]))
    // The words still have to be there, and in that order.
    #expect(!checkText("mesa na esta", ["esta na mesa"]))
    #expect(!checkText("", ["esta na mesa"]))
}

@Test func anOrderIsRightOnlyWholeAndInSequence() {
    #expect(checkOrder(["a", "b", "c"], ["a", "b", "c"]))
    #expect(!checkOrder(["a", "c", "b"], ["a", "b", "c"]))
    #expect(!checkOrder(["a", "b"], ["a", "b", "c"]))
}

// MARK: - The question, and the decode that used to throw

/// One probe as the server actually sends it. `opts: []` and `correctIndex: -1`
/// are what every kind with nothing to pick carries — the shape the unconditional
/// `correctIndex` guard rejected, which is why asking for a domain would have
/// turned the first `compute` probe into an unfixable generation loop.
private func probe(
    type: String, opts: String = "[]", correctIndex: Int = -1, expected: String
) throws -> DiagnosticQuestion {
    try JSONDecoder().decode(DiagnosticQuestion.self, from: Data("""
    {"tag":"T","q":"?","note":"n","nodeId":"x","difficulty":"easy","type":"\(type)",
     "opts":\(opts),"correctIndex":\(correctIndex),"expected":\(expected)}
    """.utf8))
}

@Test func aProbeWithNothingToPickDecodes() throws {
    let compute = try probe(type: "compute", expected: #"["0.5"]"#)
    #expect(compute.type == .compute)
    #expect(compute.opts.isEmpty)
    #expect(compute.correctIndex == -1)

    let speak = try probe(type: "speak", expected: #"["de nada","por nada"]"#)
    #expect(speak.type == .speak)
    #expect(speak.expected.count == 2)
}

@Test func aQuestionWithNoAnswerKeyIsRejected() {
    // Unmarkable is worse than missing: it would pass every learner silently.
    #expect(throws: (any Error).self) { try probe(type: "compute", expected: "[]") }
    #expect(throws: (any Error).self) { try probe(type: "order", opts: #"[{"label":"a"}]"#, expected: "[]") }
}

@Test func anUnknownKindReadsAsTheQuestionEveryPlacementUsedToAsk() throws {
    // Lenient in the same direction as `asNodeKind` and `asDomain`: a build
    // older than a kind draws a shorter app, never a broken one.
    let q = try JSONDecoder().decode(DiagnosticQuestion.self, from: Data("""
    {"tag":"T","q":"?","note":"","nodeId":"x","difficulty":"easy","type":"interpretive-dance",
     "opts":[{"label":"a"},{"label":"b"}],"correctIndex":1}
    """.utf8))
    #expect(q.type == .mcq)
    #expect(gradeDiagnostic(q, .choice(1)))
}

@Test func everyKindGradesThroughOneDoor() throws {
    let mcq = try JSONDecoder().decode(DiagnosticQuestion.self, from: Data("""
    {"tag":"T","q":"?","note":"","nodeId":"x","difficulty":"easy",
     "opts":[{"label":"a"},{"label":"b"}],"correctIndex":1}
    """.utf8))
    #expect(gradeDiagnostic(mcq, .choice(1)))
    #expect(!gradeDiagnostic(mcq, .choice(0)))

    let compute = try probe(type: "compute", expected: #"["3/4"]"#)
    #expect(gradeDiagnostic(compute, .text("0,75")))
    #expect(!gradeDiagnostic(compute, .text("0.7")))

    let order = try probe(
        type: "order", opts: #"[{"label":"b"},{"label":"a"}]"#, expected: #"["a","b"]"#
    )
    #expect(gradeDiagnostic(order, .order(["a", "b"])))
    #expect(!gradeDiagnostic(order, .order(["b", "a"])))

    // An answer of the wrong shape for its kind is wrong, never a trap.
    #expect(!gradeDiagnostic(compute, .choice(0)))
    #expect(!gradeDiagnostic(mcq, .text("a")))
}

@Test func theVerdictCanReadBackTheAnswerWhicheverKindAsked() throws {
    let compute = try probe(type: "compute", expected: #"["0.5"]"#)
    #expect(compute.answerText == "0.5")

    let order = try probe(
        type: "order", opts: #"[{"label":"b"},{"label":"a"}]"#, expected: #"["a","b"]"#
    )
    #expect(order.answerText == "a → b")
}

// MARK: - Which shape gets asked for

/// The topic has no domain column — it was dropped because it could only drift
/// from the nodes it claimed to summarise. The map is what knows.
@Test func theTopicsDomainIsTheCommonestOneOnItsMap() {
    let node = { (id: String, domain: Domain) in
        ConceptNode(id: id, label: id, domain: domain)
    }
    #expect(topicDomainOf([
        node("a", .interpretive), node("b", .interpretive), node("c", .formal),
    ]) == .interpretive)
    // A map with nothing to say falls back to the pre-axis engine.
    #expect(topicDomainOf([node("a", .general), node("b", .general)]) == .general)
    #expect(topicDomainOf([]) == .general)
    // A map built before the axis carries no domain at all.
    #expect(topicDomainOf([ConceptNode(id: "a", label: "a")]) == .general)
}
