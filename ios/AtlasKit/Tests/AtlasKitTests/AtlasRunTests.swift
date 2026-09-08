import Foundation
import Testing
@testable import AtlasKit

/// What `/api/v1` sends, and what this client makes of it.
///
/// The file this replaces tested a merge: the browser owned a `run_states`
/// snapshot, this client decoded the part it had screens for, and every key it
/// did not understand had to ride back untouched on write or a week of browser
/// work vanished the first time the map was opened on a phone. There is nothing
/// to merge now — the server owns the schema, writes are deltas, and what is
/// worth pinning is that the drawing arrives intact.

/// One topic, as the bootstrap route sends it.
private func topicJSON() -> String {
    """
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "subject": "Cálculo",
      "goal": "pareto",
      "interests": "música",
      "paretoPct": 35,
      "examDate": "2026-11-03",
      "language": "pt-BR",
      "updatedAt": "2026-09-01T10:00:00.000Z",
      "calibSamples": [{ "id": "a", "felt": 4, "real": 2 }],
      "misconceptions": [],
      "modalityTally": {},
      "litToday": [],
      "graph": {
        "nodes": [
          { "id": "a", "label": "Limite", "state": "mastered", "g": 0, "week": 0, "x": 1, "y": 2 },
          { "id": "b", "label": "Derivada", "state": "unknown", "g": 1, "week": 0, "x": 3, "y": 4 }
        ],
        "edges": [["a", "b", false]]
      },
      "states": { "a": "mastered" },
      "positions": { "a": { "x": 12, "y": 40 } },
      "shakyReasons": {},
      "reviewedNodes": ["a"],
      "consumeProgress": { "a": { "idx": 3 } },
      "cards": [
        { "id": "c1", "nodeId": "a", "type": "recall", "source": "Retain",
          "back": "…", "fsrs": { "due": "2026-09-05T10:00:00.000Z" } }
      ]
    }
    """
}

private func decoded() throws -> AtlasRun {
    try JSONDecoder().decode(AtlasRun.self, from: Data(topicJSON().utf8))
}

@Test func aTopicDecodesIntoTheMapItDraws() throws {
    let run = try decoded()
    #expect(run.subject == "Cálculo")
    #expect(run.goal == .pareto)
    #expect(run.paretoPct == 35)
    #expect(run.language == "pt-BR")
    #expect(run.graph.nodes.map(\.id) == ["a", "b"])
    #expect(run.states["a"] == .mastered)
    #expect(run.reviewedNodes == ["a"])
    #expect(run.cards.first?.nodeId == "a")
}

@Test func aDraggedPositionWinsOverTheGeneratedOne() throws {
    let run = try decoded()
    // The browser draws from `positions`, never from a node's own coordinates:
    // every node the learner drags at a desk moves there and nowhere else.
    // Folding it onto the nodes here is what makes the two clients draw the
    // same map, and leaves this side with one source of position.
    let a = try #require(run.graph.nodes.first { $0.id == "a" })
    #expect(a.x == 12)
    #expect(a.y == 40)
    // A node nobody has dragged keeps the coordinates the generation gave it.
    let b = try #require(run.graph.nodes.first { $0.id == "b" })
    #expect(b.x == 3)
}

@Test func aTopicSurvivesTheRoundTripThroughTheMirror() throws {
    // The on-device mirror stores the topic as the JSON it arrived as, so what
    // a relaunch paints has to be what the network would have painted.
    let original = try decoded()
    let reread = try JSONDecoder().decode(
        AtlasRun.self, from: try JSONEncoder().encode(original)
    )
    #expect(reread.id == original.id)
    #expect(reread.graph.nodes.map(\.id) == original.graph.nodes.map(\.id))
    #expect(reread.states == original.states)
    #expect(reread.cards.map(\.id) == original.cards.map(\.id))
    // Positions were folded onto the nodes on the way in; re-reading must not
    // fold them somewhere else.
    #expect(reread.graph.nodes.first { $0.id == "a" }?.x == 12)
}

@Test func aFieldTheServerHasNotSentYetIsADefault_notAFailure() throws {
    // A route answering with less than this build expects must degrade, not
    // refuse: an app that cannot decode its own library shows no maps at all.
    let sparse = """
    { "id": "x", "subject": "Álgebra", "graph": { "nodes": [], "edges": [] } }
    """
    let run = try JSONDecoder().decode(AtlasRun.self, from: Data(sparse.utf8))
    #expect(run.subject == "Álgebra")
    #expect(run.goal == .exam)
    #expect(run.cards.isEmpty)
    #expect(run.language == nil)
}

@Test func masteryAndFrontierAreDerivedTheOneWay() throws {
    let run = try decoded()
    #expect(run.mastered == 0.5)
    // `displayStates` is the only derivation of the frontier, here too: `b`'s
    // one prerequisite is mastered, so it is what the learner can start next.
    #expect(run.frontierCount == 1)
}
