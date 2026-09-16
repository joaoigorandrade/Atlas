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
