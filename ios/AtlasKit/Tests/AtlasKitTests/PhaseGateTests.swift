import Foundation
import Testing
@testable import AtlasKit

/// What the six phases the catalogue added actually measure.
///
/// One test per phase, and they are deliberately not one parameterised test over
/// six tables: the whole claim of a twelve-rung catalogue is that each rung
/// grades something no other rung can, and a shared assertion would pass just as
/// happily over six copies of the same two-thirds bar. Each of these pins the
/// clause that makes its phase *not* interchangeable with its neighbours.

// MARK: - Discriminate · the boundary

private func cases(_ specs: [(id: String, answer: Int, instance: Bool)]) -> DiscriminateContent {
    let json = """
    {"nodeId":"n","nodeLabel":"N","ask":"É um caso disso?","cases":[
    \(specs.map {
        """
        {"id":"\($0.id)","candidate":"c","readings":["a","b"],"answerIndex":\($0.answer),
         "decidedBy":"d","isInstance":\($0.instance)}
        """
    }.joined(separator: ","))
    ]}
    """
    return try! JSONDecoder().decode(DiscriminateContent.self, from: Data(json.utf8))
}

@Test func discriminateAlsoFailsAnOverInclusiveRun() {
    // Six cases, three of them near-misses. A learner who calls everything an
    // instance scores whatever share of the run happens to be instances — by
    // luck, not by the boundary — and waving near-misses through is the failure
    // this phase exists to catch.
    let content = cases([
        ("1", 0, true), ("2", 0, true), ("3", 0, true),
        ("4", 1, false), ("5", 1, false), ("6", 1, false),
    ])
    var everything = DiscriminateSession(nodeId: "n")
    for _ in content.cases { everything.call(0, content); everything.next(content) }
    #expect(everything.score(content) == 3)
    #expect(everything.falsePositives(content).count == 3)
    #expect(!everything.passed(content))

    // Four of six right is two thirds and would clear a score gate — but two of
    // the misses are near-misses waved through, so it still fails.
    var sloppy = DiscriminateSession(nodeId: "n")
    for (index, item) in content.cases.enumerated() {
        sloppy.call(index < 4 ? item.answerIndex : 0, content)
        sloppy.next(content)
    }
    #expect(sloppy.score(content) == 4)
    #expect(sloppy.falsePositives(content).count == 2)
    #expect(!sloppy.passed(content))

    // The same score with at most one over-inclusion passes.
    var clean = DiscriminateSession(nodeId: "n")
    for (index, item) in content.cases.enumerated() {
        clean.call(index == 5 ? 0 : item.answerIndex, content)
        clean.next(content)
    }
    #expect(clean.score(content) == 5)
    #expect(clean.passed(content))
}

@Test func discriminateTakesOneCallPerCase() {
    let content = cases([("1", 1, true)])
    var session = DiscriminateSession(nodeId: "n")
    session.call(0, content)
    // Cycling the readings until the reveal turns green is not a boundary test.
    session.call(1, content)
    #expect(session.calls["1"] == 0)
}

// MARK: - Trace · the unbroken prefix

private func chain(_ answers: [Int]) -> TraceContent {
    let stages = answers.enumerated().map { index, answer in
        """
        {"id":"s\(index)","reached":"r","nexts":["a","b"],"answerIndex":\(answer),"handsOn":"h"}
        """
    }
    let json = """
    {"nodeId":"n","nodeLabel":"N","scenario":"um caso","stages":[\(stages.joined(separator: ","))]}
    """
    return try! JSONDecoder().decode(TraceContent.self, from: Data(json.utf8))
}

@Test func traceGatesOnThePrefixRatherThanTheScore() {
    let content = chain([0, 0, 0, 0, 0, 0])
    // Broke at the first link and guessed the rest right: five of six correct,
    // which clears any two-thirds *score* bar — and is the opposite of having
    // followed a mechanism, because every later answer was given from a position
    // the learner had already left.
    var rejoined = TraceSession(nodeId: "n")
    for (index, _) in content.stages.enumerated() {
        rejoined.step(index == 0 ? 1 : 0, content)
        rejoined.next(content)
    }
    #expect(rejoined.score(content) == 5)
    #expect(rejoined.brokeAt(content) == 0)
    #expect(!rejoined.passed(content))

    // Four links unbroken, then it breaks: the prefix is two thirds of six, so
    // this is a walk.
    var walked = TraceSession(nodeId: "n")
    for (index, _) in content.stages.enumerated() {
        walked.step(index < 4 ? 0 : 1, content)
        walked.next(content)
    }
    #expect(walked.score(content) == 4)
    #expect(walked.brokeAt(content) == 4)
    #expect(walked.passed(content))
}

// MARK: - Perform · no partial credit

private func runCase(_ steps: [(id: String, loadBearing: Bool)]) -> PerformContent {
    let rows = steps.map {
        """
        {"id":"\($0.id)","step":"s","mustShow":["m"],"loadBearing":\($0.loadBearing)}
        """
    }
    let json = """
    {"nodeId":"n","nodeLabel":"N","task":"o caso","scaffold":"empurrão",
     "steps":[\(rows.joined(separator: ","))]}
    """
    return try! JSONDecoder().decode(PerformContent.self, from: Data(json.utf8))
}

@Test func performFailsOnAnyWrongStepAndOnASkippedLoadBearingOne() {
    let content = runCase([("a", true), ("b", true), ("c", false)])

    // Everything load-bearing carried out, and the optional check skipped: a
    // thinner run, not a wrong one.
    var thin = PerformSession(nodeId: "n")
    thin.ran = ["a": .good, "b": .good]
    thin.reported = true
    #expect(thin.passed(content))
    #expect(thin.skipped(content).isEmpty)

    // One wrong result fails the run however much of the rest was right — this
    // is exactly where Perform and Recall part company.
    var broken = PerformSession(nodeId: "n")
    broken.ran = ["a": .good, "b": .confused, "c": .good]
    broken.reported = true
    #expect(!broken.passed(content))
    #expect(broken.broken(content).map(\.id) == ["b"])

    // A load-bearing step that never happened is a run that never happened.
    var missing = PerformSession(nodeId: "n")
    missing.ran = ["a": .good, "c": .good]
    missing.reported = true
    #expect(!missing.passed(content))
    #expect(missing.skipped(content).map(\.id) == ["b"])
}

@Test func recallTakesPartialCreditWherePerformDoesNot() {
    let json = """
    {"nodeId":"n","nodeLabel":"N","brief":"escreva","scaffold":"dica","rubric":[
     {"id":"r1","point":"p","mustRetrieve":["m"]},
     {"id":"r2","point":"p","mustRetrieve":["m"]},
     {"id":"r3","point":"p","mustRetrieve":["m"]}]}
    """
    let content = try! JSONDecoder().decode(RecallContent.self, from: Data(json.utf8))
    var session = RecallSession(nodeId: "n")
    session.reported = true
    // Two of three back cold. Memory is partial, so this is the thing the phase
    // measures — and the same shape of miss fails a Perform run outright.
    session.retrieved = ["r1": .good, "r2": .good, "r3": .skipped]
    #expect(session.passed(content))
    session.retrieved = ["r1": .good, "r2": .confused, "r3": .skipped]
    #expect(!session.passed(content))
}

// MARK: - Drill · the clock is measured, never gated

private func reps(_ count: Int) -> DrillContent {
    let rows = (0..<count).map {
        """
        {"id":"d\($0)","prompt":"p","answers":["a","b"],"answerIndex":0,"rule":"r"}
        """
    }
    let json = """
    {"nodeId":"n","nodeLabel":"N","reps":[\(rows.joined(separator: ","))]}
    """
    return try! JSONDecoder().decode(DrillContent.self, from: Data(json.utf8))
}

@Test func drillMeasuresPaceAndGatesOnlyOnCorrectness() {
    let content = reps(3)
    let start = Date(timeIntervalSince1970: 0)
    var slow = DrillSession(nodeId: "n", now: start)
    for (index, _) in content.reps.enumerated() {
        // Twenty seconds a rep: right every time, and nothing about it is
        // automatic.
        let answered = start.addingTimeInterval(Double(index + 1) * 20)
        slow.answer(0, content, now: answered)
        slow.next(content, now: answered)
    }
    #expect(slow.score(content) == 3)
    #expect(slow.median(content) == 20)
    #expect(!slow.automatic(content))
    #expect(slow.labored(content).count == 3)
    // Right and careful is not a failure. The clock is the phase's own finding
    // and it is reported, not gated — see `DrillSession.passed`.
    #expect(slow.passed(content))
}

@Test func drillTimesEachRepFromWhenItReachedTheScreen() {
    let content = reps(2)
    let start = Date(timeIntervalSince1970: 0)
    var session = DrillSession(nodeId: "n", now: start)
    session.answer(0, content, now: start.addingTimeInterval(2))
    session.next(content, now: start.addingTimeInterval(2))
    // The second rep's clock starts when it opens, not when the run did — a rep
    // timed from the start of the phase would grow by the length of the one
    // before it.
    session.answer(0, content, now: start.addingTimeInterval(5))
    #expect(session.took["d0"] == 2)
    #expect(session.took["d1"] == 3)
}

@Test func drillSendsEveryCallNotYetAutomaticToReview() {
    // W4.4: a miss and a right-but-slow rep become cards; a fast right one
    // is already automatic and does not.
    let content = reps(3)
    let start = Date(timeIntervalSince1970: 0)
    var session = DrillSession(nodeId: "n", now: start)
    let beats: [(pick: Int, at: Double)] = [(0, 2), (1, 4), (0, 20)]
    for beat in beats {
        session.answer(beat.pick, content, now: start.addingTimeInterval(beat.at))
        session.next(content, now: start.addingTimeInterval(beat.at))
    }
    let cards = session.cards(content)
    #expect(cards.map(\.id) == ["n-drill-d1", "n-drill-d2"])
    #expect(cards.first?.back == "a — r")
}

// MARK: - Predict · confidence is read, not required

private func setups(_ count: Int) -> PredictContent {
    let rows = (0..<count).map {
        """
        {"id":"p\($0)","situation":"s","outcomes":["a","b"],"answerIndex":0,"because":"b"}
        """
    }
    let json = """
    {"nodeId":"n","nodeLabel":"N","setups":[\(rows.joined(separator: ","))]}
    """
    return try! JSONDecoder().decode(PredictContent.self, from: Data(json.utf8))
}

@Test func predictSeparatesAConfidentWrongForecastFromAnUnsureOne() {
    let content = setups(3)
    var session = PredictSession(nodeId: "n")
    // Certain and wrong, unsure and wrong, certain and right.
    session.sure(2, content); session.commit(1, content); session.next(content)
    session.sure(0, content); session.commit(1, content); session.next(content)
    session.sure(2, content); session.commit(0, content); session.next(content)

    #expect(session.score(content) == 1)
    #expect(!session.passed(content))
    // The reading the phase exists for: only the confidently-wrong one.
    #expect(session.overconfident(content).map(\.id) == ["p0"])
    // And the felt/real pairs the calibration curve is plotted from.
    #expect(session.calibration(content).map(\.felt) == [90, 35, 90])
    #expect(session.calibration(content).map(\.real) == [20, 20, 90])
}

@Test func predictLocksTheConfidenceOnceTheForecastIsIn() {
    let content = setups(1)
    var session = PredictSession(nodeId: "n")
    session.sure(0, content)
    session.commit(0, content)
    // Rating an outcome already on screen is not calibration.
    session.sure(2, content)
    #expect(session.sureness["p0"] == 0)
}

// MARK: - Early exit · a clean opening is the proof

/// A clean start ends the run: the rest of it would only collect proof the
/// learner has already given. Mirrors the `*Early` tests in `curriculum.test.ts`.
@Test func aCleanOpeningEndsTheRunEarly() {
    // Discriminate: three right, one of them a near-miss turned away.
    let boundary = cases([
        ("1", 0, true), ("2", 1, false), ("3", 0, true), ("4", 1, false), ("5", 0, true),
    ])
    var sharp = DiscriminateSession(nodeId: "n")
    for item in boundary.cases.prefix(3) { sharp.call(item.answerIndex, boundary); sharp.next(boundary) }
    #expect(sharp.done)
    #expect(sharp.early(boundary))
    #expect(sharp.passed(boundary))

    // …but not on a streak of instances alone: that could be luck.
    let instances = cases([
        ("1", 0, true), ("2", 0, true), ("3", 0, true), ("4", 1, false), ("5", 1, false),
    ])
    var lucky = DiscriminateSession(nodeId: "n")
    for _ in 0..<3 { lucky.call(0, instances); lucky.next(instances) }
    #expect(!lucky.done)

    // Drill: four reps right and inside the target time.
    let reps = try! JSONDecoder().decode(DrillContent.self, from: Data("""
    {"nodeId":"n","nodeLabel":"N","reps":[
    \((1...6).map { "{\"id\":\"r\($0)\",\"prompt\":\"p\",\"answers\":[\"a\",\"b\"],\"answerIndex\":0,\"rule\":\"r\"}" }.joined(separator: ","))
    ]}
    """.utf8))
    let t0 = Date(timeIntervalSince1970: 0)
    var fast = DrillSession(nodeId: "n", now: t0)
    for i in 0..<4 {
        let at = t0.addingTimeInterval(Double(i + 1) * 2)
        fast.answer(0, reps, now: at)
        fast.next(reps, now: at)
    }
    #expect(fast.done)
    #expect(fast.passed(reps))
}

/// A Shaky fact re-closing its last gate goes green; any other plain pass keeps
/// the reason. Mirrors `reasonAfter` in `calibration.ts`.
@Test func aCleanCloseOfTheLastGateClearsAHeldReason() {
    let plan = phasePlans[.fact]!
    let full = planGates(plan)
    #expect(reasonAfter(plan, full, .recall, held: .reviewMiss) == nil)
    #expect(reasonAfter(plan, full, .drill, held: .reviewMiss) == .reviewMiss)
    #expect(reasonAfter(plan, [.consume, .recall], .recall, held: .reviewMiss) == .reviewMiss)
    #expect(reasonAfter(plan, full, .recall, closed: .failed(.crucibleFail), held: nil) == .crucibleFail)
}

/// A concept ends on Recall, but its proof is the Crucible: passing Recall
/// again must not clear a Crucible failure, and the CTA re-opens the Crucible.
@Test func onAConceptOnlyTheCrucibleClearsAHeldReason() {
    let plan = phasePlans[.concept]!
    let full = planGates(plan)
    #expect(reasonAfter(plan, full, .recall, held: .crucibleFail) == .crucibleFail)
    #expect(reasonAfter(plan, full, .crucible, held: .crucibleFail) == nil)
    #expect(primaryPhase(plan, full, state: .shaky) == .crucible)
}

// MARK: - Produce · speaking, not routing around the form

private func scene(_ count: Int) -> ProduceContent {
    let turns = (1...count).map {
        #"{"id":"t\#($0)","cue":"c","targetForms":["f"],"seconds":20}"#
    }.joined(separator: ",")
    let json = #"{"nodeId":"n","nodeLabel":"N","scene":"s","turns":[\#(turns)]}"#
    return try! JSONDecoder().decode(ProduceContent.self, from: Data(json.utf8))
}

@Test func produceFailsARunThatUnderstoodButAvoidedTheForm() {
    let content = scene(6)
    func run(_ verdicts: [ProduceVerdict]) -> ProduceSession {
        var session = ProduceSession(nodeId: "n")
        for verdict in verdicts {
            session.said("x", content)
            session.judged(verdict, read: "", content)
            session.next(content)
        }
        return session
    }
    // Four good, two thin: two thirds landed, but two were routed around.
    #expect(!run([.good, .good, .good, .good, .thin, .thin]).passed(content))
    // Four good, one thin, one wrong: the one dodge the gate allows.
    #expect(run([.good, .good, .good, .good, .thin, .wrong]).passed(content))
    #expect(!run([.good, .good, .good, .wrong, .wrong, .wrong]).passed(content))
}

// MARK: - Provenance · the source is an act, not a record

private func claims(_ rulings: [ProvenanceRuling]) -> ProvenanceContent {
    let items = rulings.enumerated().map {
        #"{"id":"c\#($0.offset)","claim":"x","ruling":"\#($0.element.rawValue)","because":"b"}"#
    }.joined(separator: ",")
    let json = #"""
    {"nodeId":"n","nodeLabel":"N","source":{"title":"t","attribution":"a","date":"d","excerpt":"e"},
     "claims":[\#(items)],"silence":"s"}
    """#
    return try! JSONDecoder().decode(ProvenanceContent.self, from: Data(json.utf8))
}

@Test func provenanceFailsARunThatTookTheSourceAtItsWord() {
    let content = claims([.asserts, .asserts, .proves, .proves, .neither, .neither])
    func run(_ given: [ProvenanceRuling]) -> ProvenanceSession {
        var session = ProvenanceSession(nodeId: "n")
        for ruling in given { session.rule(ruling, content); session.next(content) }
        return session
    }
    // Four of six right — two thirds — but both assertions read as proof.
    let credulous = run([.proves, .proves, .proves, .proves, .neither, .neither])
    #expect(credulous.score(content) == 4)
    #expect(!credulous.passed(content))
    #expect(run([.asserts, .proves, .proves, .proves, .neither, .neither]).passed(content))
    // One ruling per claim: cycling the options is recognition, not judgement.
    var session = ProvenanceSession(nodeId: "n")
    session.rule(.proves, content)
    session.rule(.asserts, content)
    #expect(session.rulings["c0"] == .proves)
}

// MARK: - Steelman · both sides, judged on their own terms

private let dispute: SteelmanContent = try! JSONDecoder().decode(SteelmanContent.self, from: Data(#"""
{"nodeId":"n","nodeLabel":"N","question":"q","positions":[
 {"id":"a","label":"A","heldBy":"x","mustCover":[]},
 {"id":"b","label":"B","heldBy":"y","mustCover":[]}]}
"""#.utf8))

@Test func steelmanFailsAStrawmanWhateverTheOtherSideScored() {
    var session = SteelmanSession(nodeId: "n")
    session.write("a", String(repeating: "a", count: 40))
    #expect(!session.ready(dispute))
    session.write("b", String(repeating: "b", count: 40))
    #expect(session.ready(dispute))
    session.hold("a", disconfirmer: "um documento novo")
    session.judged(["a": .strong, "b": .strawman], response: "")
    #expect(!session.passed(dispute))
    session.judged(["a": .strong, "b": .thin], response: "")
    #expect(session.passed(dispute))
    // A disconfirmer is something that could actually turn up, not a shrug.
    session.hold("a", disconfirmer: "nada")
    #expect(!session.passed(dispute))
}

/// Counted as the web counts `.length`: an emoji is two UTF-16 units, so twenty
/// of them are a forty-unit case on both clients.
@Test func steelmanCountsACaseTheWayTheWebDoes() {
    #expect(SteelmanSession.written(String(repeating: "🙂", count: 20), atLeast: 40))
    #expect(!SteelmanSession.written(String(repeating: "🙂", count: 19), atLeast: 40))
}

/// The two-thirds bar, in integers, against the web's `Math.ceil(n * 2/3)`.
@Test func twoThirdsRoundsUpLikeTheWeb() {
    #expect((0...12).map(twoThirds) == [0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 8])
}

// MARK: - W3.1: rationing the heavy phases

@Test func noPlanExceedsItsCellCap() {
    for kind in NodeKind.allCases {
        for domain in Domain.allCases {
            for difficulty in [NodeDifficulty.easy, .medium, .hard] {
                // Explain is outside the cap by design (`ration`).
                let gates = planGates(resolvePlan(kind, domain, .core, difficulty)).filter { $0 != .explain }.count
                #expect(gates <= gateCap(difficulty), "\(kind)/\(domain)/\(difficulty)")
            }
        }
    }
}

@Test func theHeavyPhasesRunWhereTheMapFoundWhatTheyNeed() {
    let plan = resolvePlan(.concept, .interpretive, .core, .hard,
                           PlanEvidence(contested: false, transferable: false, individual: true, neighbours: 1))
    for phase in [Phase.steelman, .crucible, .discriminate, .connect] { #expect(!plan.contains(phase)) }
    // Absent evidence rations nothing.
    #expect(resolvePlan(.concept, .interpretive, .core, .hard).contains(.steelman))
    // The same easy ladder as the web: five gates, Connect trimmed first.
    #expect(resolvePlan(.concept, .general, .core, .easy)
        == [.consume, .explain, .discriminate, .feynman, .crucible, .recall, .retain])
}

@Test func aCleanFirstTryEarnsTheEasierGateBeforeIt() {
    // W3.2: Feynman clean credits Socratic; Perform clean credits Trace.
    let concept = phasePlans[.concept]!
    #expect(ledgerAfter(concept, [.consume], .feynman, challenged: false, clean: true)
        .contains(.socratic))
    #expect(!ledgerAfter(concept, [.consume], .feynman, challenged: false).contains(.socratic))
    let procedure = phasePlans[.procedure]!
    #expect(ledgerAfter(procedure, [.consume], .perform, challenged: false, clean: true)
        .contains(.trace))
}

// MARK: - Explain · explanation design

private let explanation = try! JSONDecoder().decode(ExplainContent.self, from: Data("""
{"nodeId":"n","nodeLabel":"N","problem":"p","analogy":{"text":"a","breaks":"b"},
 "order":["1","2","3"],"misconception":{"belief":"m","tempting":"t"},
 "checkBack":{"question":"q","rightAnswer":"r"},
 "listener":{"says":"s","replies":[
   {"label":"x","correct":false,"why":"w"},
   {"label":"y","correct":true,"why":"w"},
   {"label":"z","correct":false,"why":"w"}]}}
""".utf8))

@Test func explainHoldsTheCheckUntilTheModelIsShownThenTeachesAMiss() {
    var session = ExplainSession(nodeId: "n")
    // The check waits on all five cards.
    session.pick(1, explanation)
    #expect(!session.done && session.picked == nil)
    for _ in ExplainCard.allCases { session.reveal() }
    #expect(session.checking && session.revealed == ExplainCard.allCases.count)
    // A miss is taught and ruled out, never a second try…
    session.pick(0, explanation)
    #expect(!session.passed && session.tried == [0])
    session.pick(0, explanation)
    #expect(session.tried == [0])
    // …and the gate is finding the reply, however many tries it took.
    session.pick(1, explanation)
    #expect(session.passed)
}

@Test func explainRidesBehindTheReadingOutsideTheCap() {
    for kind in NodeKind.allCases {
        for importance in NodeImportance.allCases {
            for difficulty in NodeDifficulty.allCases {
                let plan = resolvePlan(kind, .general, importance, difficulty)
                #expect(plan.prefix(2) == [.consume, .explain])
                let capped = planGates(plan).filter { $0 != .explain }.count
                if importance == .core { #expect(capped <= gateCap(difficulty)) }
            }
        }
    }
    // Performative replaces its ladder with production and goes without.
    #expect(!resolvePlan(.concept, .performative).contains(.explain))
    // Explain never becomes the gate a night's hold waits on.
    #expect(lastGate([.consume, .explain, .retain]) == .consume)
    #expect(heldGate([.consume, .explain, .retain], [], .consume) == nil)
}
