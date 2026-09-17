import Foundation
import Testing
@testable import AtlasKit

/// Drill's clock is the phase's whole reason to exist: it is the only rung that
/// can tell a learner who *knows* the answer from one who re-derives it
/// correctly every time. So the one thing it must not measure is time the
/// learner was not there.
///
/// A phone left on a rep overnight showed `25426.9s` and would have filed that
/// rep as answered-but-slow — `labored`, the one finding this phase produces.

@Test func timeTheAppSpentSuspendedIsNotTimeSpentDeriving() throws {
    let content = DrillContent(
        nodeId: "mult", nodeLabel: "Tabuada",
        reps: [
            DrillRep(
                id: "r1", prompt: "6 × 7", answers: ["42", "36", "48"],
                answerIndex: 0, rule: "6 × 7 = 42"
            )
        ]
    )
    let opened = Date(timeIntervalSince1970: 1_000_000)
    var session = DrillSession(nodeId: "mult", now: opened)

    // The learner looks at it for two seconds, gets a phone call, comes back an
    // hour later and answers at once.
    session.idled(3600)
    session.answer(0, content, now: opened.addingTimeInterval(3602))

    let took = try #require(session.took["r1"])
    #expect(took < drillTarget)
    #expect(session.labored(content).isEmpty)
    #expect(session.automatic(content))
}

@Test func anIdleThatNeverHappenedChangesNothing() {
    let opened = Date(timeIntervalSince1970: 1_000_000)
    var session = DrillSession(nodeId: "mult", now: opened)
    session.idled(0)
    session.idled(-5)
    #expect(session.openedAt == opened)
}
