import Foundation
import Testing
@testable import AtlasKit

/// What a saved row decodes to when it was written by someone else — the
/// browser, an older build, a newer web with a value this build has never seen.
///
/// Every case here is the shape the fixtures never produce: they are all built
/// by this build's own initialisers, so they always carry every key it knows.

private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

/// A teach-back saved before `fixRuledOut`, `reported` and `pending` existed.
/// The synthesized decoder refused the whole row, and the first keystroke on
/// the "fresh" pass overwrote it.
@Test func aTeachBackSavedByAnOlderClientStillOpens() throws {
    let saved = try decode(FeynmanSnapshot.self, #"""
    {"nodeId":"n","explanation":"Um limite é…","verdicts":{"b1":"good","b2":"telepathic"}}
    """#)
    #expect(saved.explanation == "Um limite é…")
    #expect(saved.verdicts == ["b1": .good])
    #expect(!saved.reported)
    #expect(saved.fixRuledOut.isEmpty)
    #expect(saved.previous == nil)
}

@Test func anElaborationSavedWithoutTheMnemonicFieldsStillOpens() throws {
    let saved = try decode(ConnectSnapshot.self, #"{"nodeId":"n","drafts":{"c1":"liga porque…"},"linked":{"c1":true}}"#)
    #expect(saved.drafts["c1"] == "liga porque…")
    #expect(saved.linked["c1"] == true)
    #expect(saved.mnemonicDraft.isEmpty)
    #expect(!saved.mnemonicAccepted)
}

/// A topic as the server sends it, with the parts under test spliced in.
private func topic(states: String = "{}", reasons: String = "{}", cards: String = "[]",
                   positions: String = "{}", nodes: String = "[]") -> String {
    """
    {"id":"t","subject":"S","goal":"exam","interests":"","paretoPct":20,"examDate":"",
     "updatedAt":"2026-09-01T10:00:00.000Z","calibSamples":[],"litToday":[],
     "graph":{"nodes":\(nodes),"edges":[]},"states":\(states),"positions":\(positions),
     "shakyReasons":\(reasons),"reviewedNodes":[],"consumeProgress":{},"cards":\(cards)}
    """
}

/// One value a newer web wrote drops itself — not every reason on the topic,
/// which is what decoding the map whole under one `try?` did.
@Test func oneUnknownValueDropsOnlyItself() throws {
    let run = try decode(AtlasRun.self, topic(
        states: #"{"a":"mastered","b":"transcendent"}"#,
        reasons: #"{"a":"crucible-fail","b":"cosmic-ray"}"#
    ))
    #expect(run.states == ["a": .mastered])
    #expect(run.shakyReasons == ["a": .crucibleFail])
}

@Test func oneCardOfAnUnknownTypeLeavesTheRestOfTheDeck() throws {
    let card = { (id: String, type: String) in
        #"{"id":"\#(id)","nodeId":"a","type":"\#(type)","source":"s","back":"b","fsrs":{}}"#
    }
    let run = try decode(AtlasRun.self, topic(cards: "[\(card("1", "recall")),\(card("2", "hologram")),\(card("3", "why"))]"))
    #expect(run.cards.map(\.id) == ["1", "3"])
}

/// The row's `positions` map is folded onto the nodes and then emptied — the
/// mirror re-encodes the run, and a stale map folded back over a dragged node
/// put it where it started.
@Test func aDraggedNodeSurvivesTheMirror() throws {
    var run = try decode(AtlasRun.self, topic(
        positions: #"{"a":{"x":10,"y":20}}"#,
        nodes: #"[{"id":"a","label":"A","x":0,"y":0}]"#
    ))
    #expect(run.graph.nodes[0].x == 10)
    run.graph.nodes[0].x = 99
    let mirrored = try JSONDecoder().decode(AtlasRun.self, from: JSONEncoder().encode(run))
    #expect(mirrored.graph.nodes[0].x == 99)
}

/// A rep whose key points past its own answers could never be answered right.
@Test func aDrillRepWithNoRightAnswerIsDropped() throws {
    let content = try decode(DrillContent.self, #"""
    {"nodeId":"n","nodeLabel":"N","reps":[
     {"id":"1","prompt":"p","answers":["a","b"],"answerIndex":1,"rule":"r"},
     {"id":"2","prompt":"p","answers":["a","b"],"answerIndex":4,"rule":"r"}]}
    """#)
    #expect(content.reps.map(\.id) == ["1"])
}

/// `updated_at` comes back in Postgres's shape and the mirror stamps its own;
/// comparing the strings compared the formats.
@Test func timestampsCompareAsInstantsNotAsStrings() {
    #expect(ISODate.older("2026-09-28T10:00:00.123Z", than: "2026-09-28T10:00:01.000000+00:00"))
    #expect(!ISODate.older("2026-09-28T10:00:02.000Z", than: "2026-09-28T10:00:01.999999+00:00"))
    // As strings, "Z" sorts after "." — so this whole second read as newer.
    #expect(ISODate.older("2026-09-28T10:00:01Z", than: "2026-09-28T10:00:01.500000+00:00"))
}
