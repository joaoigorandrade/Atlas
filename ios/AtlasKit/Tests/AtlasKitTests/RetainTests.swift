import Foundation
import Testing
@testable import AtlasKit

/// What Review writes and what the scheduler promises. Layout is layout; these
/// three are the parts that lie to the learner if they drift: the interval on a
/// grade button, the alive-loop a miss opens, and the calibration reading the
/// tap-then-grade pair produces.

@MainActor private func store(_ states: StateMap = ["lat": .mastered]) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(baseURL: URL(string: "https://supabase.test")!, apiKey: "anon"),
        graph: ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")]),
        states: states,
        subject: "Cálculo I"
    )
}

private func card(_ id: String = "c1", node: String = "lat") -> ReviewCard {
    ReviewCard(id: id, type: .recall, source: "de Connect", node: node,
               cloze: ["Um limite existe quando ", " coincidem."], answer: "os laterais",
               front: nil, back: "os limites laterais coincidem", reExplain: "Os dois lados discordam.")
}

@Test func gradesScheduleFurtherOutTheBetterTheyAre() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let fresh = ScheduledCard(card(), now: now)
    let intervals = ReviewGrade.allCases.map { fresh.graded($0, now: now).due.timeIntervalSince(now) }
    #expect(intervals == intervals.sorted())
    // A miss stays inside the day; everything else buys at least one.
    #expect(intervals[0] < 3600)
    #expect(intervals[1] >= 86_400)

    // Repeated Goods compound rather than resetting to the same day.
    let once = fresh.graded(.good, now: now)
    let twice = once.graded(.good, now: once.due)
    #expect(twice.interval > once.interval)
}

@Test func theQueueIsWhatIsDue_cutToTheDailyTarget() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    var later = ScheduledCard(card("future"), now: now)
    later.due = now.addingTimeInterval(86_400)
    let due = (0..<20).map { ScheduledCard(card("c\($0)"), now: now) }
    let queue = todaysQueue(due + [later], target: 15, now: now)
    #expect(queue.count == 10)
    #expect(!queue.contains { $0.id == "future" })
}

@MainActor
@Test func aTapThenAGradeIsOneCalibrationReading() {
    let owner = store()
    let review = ReviewViewModel(store: owner, deck: [ScheduledCard(card())])

    // Nothing is graded before the card is flipped.
    review.grade(.good)
    #expect(review.results.isEmpty)

    review.tap(.solid)
    #expect(review.stage == .reveal)
    review.grade(.again)

    #expect(owner.calib.first?.id == "lat")
    #expect(owner.calib.first?.felt == ReviewConfidence.solid.felt)
    #expect(owner.calib.first?.real == ReviewGrade.again.real)
    #expect(calibItems(owner.calib, owner.graph).first?.verdict == .over)
}

@MainActor
@Test func aMissReEntersTheSpiralAndComesBackOnce() {
    let owner = store()
    let review = ReviewViewModel(store: owner, deck: [ScheduledCard(card())])
    review.tap(.solid)
    review.grade(.again)

    // The alive-loop: the node is Shaky on the map and the card is at the end
    // of the deck, not gone for the day.
    #expect(review.stage == .failed)
    #expect(owner.states["lat"] == .shaky)
    #expect(owner.reviewed.isEmpty)
    #expect(review.deck.count == 2)

    review.advance()
    review.tap(.blank)
    review.grade(.again)
    // Once. A card nobody can answer is not a session without an end.
    #expect(review.deck.count == 2)
}

@MainActor
@Test func onlyARealReviewEarnsRetained() {
    let owner = store()
    let review = ReviewViewModel(store: owner, deck: [ScheduledCard(card())])
    review.tap(.solid)
    review.grade(.good)

    #expect(review.finished)
    #expect(owner.reviewed.contains("lat"))
    #expect(phaseIndex(.mastered, reviewed: owner.reviewed.contains("lat")) == 6)
    // The scheduler kept the card — it is due later, not gone.
    #expect(owner.cards.count == 1)
    #expect(owner.queue.isEmpty)
}

@MainActor
@Test func readingsAverageAndSortWorstFirst() {
    let owner = store()
    owner.recordCalib("lat", felt: 90, real: 30)
    owner.recordCalib("lat", felt: 80, real: 40)
    #expect(owner.calib.count == 1)
    #expect(owner.calib[0].felt == 85)
    #expect(owner.calib[0].real == 35)

    owner.recordCalib("der", felt: 70, real: 68)
    owner.recordCalib("lim", felt: 30, real: 70)
    let items = calibItems(owner.calib, owner.graph)
    #expect(items.map(\.verdict) == [.over, .under, .ok])
    // A node that isn't on the map still reads as itself rather than vanishing.
    #expect(items[1].label == "lim")
}
