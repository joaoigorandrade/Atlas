import Testing
@testable import AtlasKit

/// The snapshot is the only thing standing between a relaunch and a lost map,
/// and it is a format this client shares with a web app that writes more of it.
/// Both halves of that are worth pinning: what the phone stores comes back, and
/// what the browser stored is still there afterwards.

/// A row written by the browser, carrying keys only its screens fill in.
private func webRow() -> JSONValue {
    .object([
        "v": .number(9),
        "form": .object([
            "topic": .string("Cálculo"),
            "goal": .string("pareto"),
            "interests": .string("música"),
            "target": .number(20),
            "examDate": .string("2026-11-03"),
            "paretoPct": .number(35),
        ]),
        "language": .string("pt-BR"),
        "graph": .object([
            "nodes": .array([
                .object(["id": .string("a"), "label": .string("Limite")]),
                .object(["id": .string("b"), "label": .string("Derivada")]),
            ]),
            "edges": .array([.array([.string("a"), .string("b"), .bool(false)])]),
        ]),
        "states": .object(["a": .string("mastered")]),
        "calibSamples": .array([.object(["id": .string("a"), "felt": .number(4), "real": .number(2)])]),
        "reviewedNodes": .array([.string("a")]),
        "adherence": .object(["streak": .number(6), "lastDay": .string("2026-08-20")]),
        // A reading pass the browser left part-way through. Both clients read
        // and write this one; the three keys inside it that only the browser
        // fills in are carried the same way the row's own are.
        "consumeProgress": .object(["a": .object([
            "idx": .number(2),
            "total": .number(5),
            "finished": .bool(false),
            "handedOff": .bool(false),
            "checks": .object(["c1": .object(["oi": .number(1), "correct": .bool(true)])]),
            "variant": .object(["c1": .string("analogy")]),
            "collapsed": .object(["c1": .bool(true)]),
            "termsSeen": .array([.string("c1:limite")]),
        ])]),
        // The keys this client has no screen for. Losing any of them is a week
        // of browser work gone the first time the app is opened on a phone.
        "misconceptions": .array([.string("confunde taxa com total")]),
        "positions": .object(["a": .object(["x": .number(12), "y": .number(40)])]),
    ])
}

@Test func snapshotReadsWhatTheBrowserWrote() throws {
    let run = try #require(RunSnapshot(subject: "Cálculo", snapshot: webRow()))

    #expect(run.graph.nodes.count == 2)
    #expect(run.graph.edges.first?.to == "b")
    #expect(run.states["a"] == .mastered)
    #expect(run.goal == .pareto)
    #expect(run.interests == "música")
    #expect(run.target == 20)
    #expect(run.language == "pt-BR")
    #expect(run.calib.first?.felt == 4)
    #expect(run.reviewed == ["a"])
    // Where the browser's reading stopped — what the phone resumes on, and what
    // keeps the spiral from drawing Consume and Socratic as done.
    #expect(run.consumeProgress["a"]?.idx == 2)
    #expect(run.consumeProgress["a"]?.total == 5)
    #expect(run.consumeProgress["a"]?.finished == false)
    #expect(run.consumeProgress["a"]?.checks["c1"] == ConsumeCheck(oi: 1, correct: true))
    // Derived the same way the open run derives them, so a dashboard card and
    // the map itself can never disagree.
    #expect(run.mastered == 0.5)
    #expect(run.frontierCount == 1)
}

@Test func savingFromTheAppKeepsEveryKeyOnlyTheBrowserWrites() throws {
    var run = try #require(RunSnapshot(subject: "Cálculo", snapshot: webRow()))
    run.states["b"] = .learning
    run.interests = "corrida"
    run.consumeProgress["a"]?.idx = 3

    let saved = try #require(run.snapshot.fields)

    // What the phone changed is what changed.
    #expect(try #require(saved["states"]).decode(StateMap.self)["b"] == .learning)
    #expect(saved["form"]?.fields?["interests"] == .string("corrida"))

    // The reading position is shared, so it is written rather than carried —
    // but the keys inside the record that only the browser fills in survive it,
    // and `enterSession` spreads all three straight into its live session.
    let reading = try #require(saved["consumeProgress"]?.fields?["a"]?.fields)
    #expect(reading["idx"] == .number(3))
    #expect(reading["variant"] == .object(["c1": .string("analogy")]))
    #expect(reading["collapsed"] == .object(["c1": .bool(true)]))
    #expect(reading["termsSeen"] == .array([.string("c1:limite")]))
    #expect(reading["checks"] == .object(["c1": .object(["oi": .number(1), "correct": .bool(true)])]))

    // Everything else is handed back exactly as it arrived.
    #expect(saved["misconceptions"] == webRow().fields?["misconceptions"])
    #expect(saved["positions"] == webRow().fields?["positions"])
    // Including inside the two objects this client only partly owns.
    #expect(saved["form"]?.fields?["examDate"] == .string("2026-11-03"))
    #expect(saved["form"]?.fields?["paretoPct"] == .number(35))
    #expect(saved["adherence"]?.fields?["streak"] == .number(6))
}

@Test func aMapBuiltOnThePhoneCarriesEveryKeyTheBrowserReadsUnguarded() throws {
    // No row to merge onto — the first save of a run built in onboarding.
    var run = RunSnapshot(subject: "Álgebra")
    run.graph = ConceptGraph(nodes: [ConceptNode(id: "a", label: "Vetor", gap: true)])
    var progress = ConsumeProgress()
    progress.idx = 1
    progress.total = 4
    run.consumeProgress = ["a": progress]

    let saved = try #require(run.snapshot.fields)

    // A reading recorded on the phone has to be one the browser can reopen:
    // `enterSession` spreads these three into its session with no fallback.
    let reading = try #require(saved["consumeProgress"]?.fields?["a"]?.fields)
    #expect(reading["idx"] == .number(1))
    #expect(reading["variant"] == .object([:]))
    #expect(reading["collapsed"] == .object([:]))
    #expect(reading["termsSeen"] == .array([]))
    #expect(reading["checks"] == .object([:]))

    // `useRunState` assigns these straight into state with no fallback of its
    // own, so a missing one is a crash in the browser rather than a default.
    #expect(saved["form"]?.fields?["examDate"] == .string(""))
    #expect(saved["adherence"]?.fields?["lastDay"] == .string(""))
    #expect(saved["positions"] == .object([:]))
    #expect(saved["litToday"] == .array([]))
    #expect(saved["spawnedIds"] == .array([.string("a")]))
    #expect(saved["v"] == .number(9))
}

@Test func aRowThisAppHasNoVersionForIsSkippedRatherThanGuessedAt() {
    #expect(RunSnapshot(subject: "x", snapshot: .object(["v": .number(99)])) == nil)
    #expect(RunSnapshot(subject: "x", snapshot: .object(["graph": .object([:])])) == nil)
    #expect(RunSnapshot(subject: "x", snapshot: .null) == nil)
}

/// The queue is the one field the two clients genuinely cannot share — SM-2
/// here, FSRS there — so it travels beside the browser's, never over it.
@Test func theCardQueueRoundTripsWithoutTouchingTheBrowsersOwn() throws {
    var row = try #require(webRow().fields)
    row["cards"] = .array([.object(["id": .string("fsrs-1")])])

    var run = try #require(RunSnapshot(subject: "Cálculo", snapshot: .object(row)))
    run.cards = [ScheduledCard(ReviewCard(
        id: "c1", type: .recall, source: "Connect", node: "a",
        cloze: nil, answer: nil, front: "O que é um limite?",
        back: "O valor de que a função se aproxima.", reExplain: nil
    ))]

    let saved = try #require(run.snapshot.fields)
    #expect(saved["cards"] == .array([.object(["id": .string("fsrs-1")])]))

    let reread = try #require(RunSnapshot(subject: "Cálculo", snapshot: .object(saved)))
    #expect(reread.cards.count == 1)
    #expect(reread.cards.first?.card.back == "O valor de que a função se aproxima.")
    #expect(reread.cards.first?.ease == 2.5)
}
