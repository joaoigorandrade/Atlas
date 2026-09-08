import Foundation
import Testing
@testable import AtlasKit

/// What Review writes. Layout is layout; these are the parts that lie to the
/// learner if they drift: the alive-loop a miss opens, the calibration reading
/// the tap-then-grade pair produces, and the review history that finally earns
/// Retained.
///
/// The scheduler itself is deliberately not tested here any more — it does not
/// live here. This client used to carry a hand-rolled SM-2 while the browser
/// used FSRS, so the same card had two different due dates depending on which
/// screen graded it; the scheduling now happens in one place (`lib/fsrs.ts`) and
/// the interval on each grade button arrives with the card.

@MainActor private func store(_ states: StateMap = ["lat": .mastered]) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [ConceptNode(id: "lat", label: "Limites laterais")]),
        states: states,
        subject: "Cálculo I"
    )
}

private func card(_ id: String = "c1", node: String = "lat") -> ReviewCard {
    ReviewCard(id: id, type: .recall, source: "de Connect", node: node,
               cloze: ["Um limite existe quando ", " coincidem."], answer: "os laterais",
               front: nil, back: "os limites laterais coincidem",
               reExplain: "Os dois lados discordam.",
               fsrs: ["again": "<1 d", "hard": "1 d", "good": "3 d", "easy": "6 d"])
}

@Test func everyGradeButtonCarriesTheIntervalItSchedules() {
    // The numbers come from the server, computed by the same scheduler that
    // will apply them. What this checks is that the phone shows them rather
    // than deriving its own — a button reading "3 d" over a card the server
    // will move by ten is the exact lie the SM-2 port used to tell.
    let deck = card()
    #expect(ReviewGrade.allCases.allSatisfy { deck.label(for: $0) != nil })
    #expect(deck.label(for: .good) == "3 d")
    // A card that arrived from anywhere but the deck endpoint shows the grade
    // alone. No interval is better than a made-up one.
    let minted = ReviewCard(id: "c2", type: .why, source: "Connect", node: "lat",
                            cloze: nil, answer: nil, front: "Por quê?", back: "Porque.",
                            reExplain: nil, fsrs: nil)
    #expect(minted.label(for: .good) == nil)
}

@MainActor
@Test func aTapThenAGradeIsOneCalibrationReading() {
    let owner = store()
    let review = ReviewViewModel(store: owner, deck: [card()])

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
    let review = ReviewViewModel(store: owner, deck: [card()])
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
    let review = ReviewViewModel(store: owner, deck: [card()])
    review.tap(.solid)
    review.grade(.good)

    #expect(review.finished)
    #expect(owner.reviewed.contains("lat"))
    #expect(phaseIndex(.mastered, reviewed: owner.reviewed.contains("lat")) == 6)
    // The card leaves today's deck the moment it is graded; where it goes next
    // is the server's answer, not this client's.
    #expect(owner.deck.isEmpty)
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
