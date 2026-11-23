// The Frontier Feed, and the ink bet on its answers — the port of
// `lib/curriculum/feed.ts`. A short round of cards dealt from the next few
// readings on the map. Each card is a Consume pretest — the section's own
// check, asked before it is read — so the feed is not a phase and writes no
// mastery: its answer lands in the same reading record the pass resumes from.
//
// The ink is a bet placed on each pretest answer, before its verdict. It pays
// out on being right *and honest about it*, never on time spent reading.

/// What each confidence tap — least sure first, the `CONFIDENCE_FELT` order —
/// wins on a right answer and loses on a wrong one. `INK_STAKES` on the web.
///
/// Lopsided so the best bet is the honest one: "fairly sure" beats "not sure"
/// once the chance of being right passes 1/2, and "very sure" beats "fairly
/// sure" past 2/3. A symmetric table would pay for bravado.
public let inkStakes: [(win: Int, lose: Int)] = [(1, 0), (2, 1), (3, 3)]

/// Ink won (positive) or lost (negative) on one bet.
public func inkDelta(_ stake: Int, correct: Bool) -> Int {
    let s = inkStakes[safe: stake] ?? inkStakes[0]
    return correct ? s.win : -s.lose
}

/// The map's ink: every pretest bet over every reading, won or lost. Derived,
/// never stored — a total can never drift from the record it sums. It can go
/// below zero: that is what a run of confident misses honestly comes to.
public func inkBalance(_ readings: some Sequence<ReadingProgress>) -> Int {
    readings.reduce(0) { ink, p in
        p.stakes.reduce(ink) { ink, bet in
            guard let correct = p.pretest[bet.key] else { return ink }
            return ink + inkDelta(bet.value, correct: correct)
        }
    }
}

/// How big a round is. Few concepts on purpose: answering a card begins its
/// reading, and a round should start the next few, not every one on the map.
public enum FeedSize {
    public static let concepts = 3
    /// A few minutes, and then it ends.
    public static let cards = 12
}

/// Is this section's check still to be asked before the section is read? Only
/// a section with a check, never answered either way. `needsPretest`.
func needsPretest(_ p: ReadingProgress, _ chunk: ConsumeChunk) -> Bool {
    chunk.check != nil && p.pretest[chunk.id] == nil && !p.answered.contains(chunk.id)
}

/// The section a concept's next card asks about: its first section still to be
/// pretested. None while a miss is still open on it — the sections after a
/// missed one build on it, and belong to the reading. None on a finished one.
public func feedSection(_ chunks: [ConsumeChunk], _ saved: ReadingProgress?) -> ConsumeChunk? {
    let p = saved ?? ReadingProgress(finished: false, handedOff: false)
    if p.finished { return nil }
    for chunk in chunks {
        if p.pretest[chunk.id] == false && !p.checks.contains(chunk.id) { return nil }
        if needsPretest(p, chunk) { return chunk }
    }
    return nil
}

/// The concepts a round deals from: the first `FeedSize.concepts` of `order`
/// whose reading is written and still has a card in it.
public func feedConcepts(_ order: [String], _ cache: [String: [ConsumeChunk]],
                         _ progress: [String: ReadingProgress]) -> [String] {
    var out: [String] = []
    for id in order where out.count < FeedSize.concepts && !out.contains(id) {
        if let chunks = cache[id], feedSection(chunks, progress[id]) != nil { out.append(id) }
    }
    return out
}

/// The next card: the first of the round's concepts, in order, with a card
/// left. The round rotates an answered concept to the back, so cards change
/// subject. Nil when none has one.
public func nextFeedCard(_ concepts: [String], _ cache: [String: [ConsumeChunk]],
                         _ progress: [String: ReadingProgress]) -> (nodeId: String, chunk: ConsumeChunk)? {
    for id in concepts {
        if let chunk = cache[id].flatMap({ feedSection($0, progress[id]) }) { return (id, chunk) }
    }
    return nil
}
