import Foundation
import Testing
@testable import AtlasKit

/// The reading pass's own rules — the ones that gate the phase and the ones the
/// map reads afterwards. Everything else on screen 14 is layout; these are what
/// lie to the learner if they drift.

@MainActor private func store() -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(
            nodes: [ConceptNode(id: "lat", label: "Limites laterais")],
            edges: []
        ),
        states: ["lat": .frontier],
        subject: "Cálculo I"
    )
}

/// A pass of `sections` sections, seeded straight into the warm cache the way a
/// stored reading arrives from the topic's content.
@MainActor private func reading(_ store: AtlasStore, _ raw: [JSONValue]) {
    store.seedWarm([
        RunStore.ContentItem(nodeId: "lat", kind: "consume", variant: "", payload: .array(raw))
    ])
}

/// One section, with whatever check is handed in.
private func section(_ id: String, check: JSONValue? = nil) -> JSONValue {
    var fields: [String: JSONValue] = [
        "id": .string(id),
        "kicker": .string("1 · O que é"),
        "body": .array([.string("Uma explicação.")]),
        "takeaway": .string("O ponto."),
    ]
    if let check { fields["check"] = check }
    return .object(fields)
}

private func check(correct: [Bool]) -> JSONValue {
    .object([
        "q": .string("Qual delas?"),
        "opts": .array(correct.map { .object(["label": .string("uma"), "correct": .bool($0)]) }),
        "right": .string("Isso."),
        "wrong": .string("Quase."),
    ])
}

@MainActor private func consume(_ store: AtlasStore) -> ConsumeViewModel {
    ConsumeViewModel(session: SessionViewModel(node: store.graph.nodes[0], store: store), api: store.api)
}

@MainActor
@Test func aCheckWithNoRightAnswerLeavesTheSectionUngatedRatherThanStuck() {
    let store = store()
    // `consume` is generated on the device, where no `validatePrediction` runs.
    // A check nobody can pass would be a gate that never opens on a screen
    // whose only exit is the back arrow.
    reading(store, [section("c1", check: check(correct: [false, false, false]))])
    let model = consume(store)
    #expect(model.chunk?.check == nil)
    #expect(model.passed)

    // Two right answers is the same kind of unanswerable, and so is one option.
    reading(store, [])
    store.warm.clear()
    reading(store, [section("c1", check: check(correct: [true, true, false]))])
    #expect(consume(store).chunk?.check == nil)
}

@MainActor
@Test func aMissSpendsOneOptionAndTheSectionTurnClearsTheSlate() {
    let store = store()
    reading(store, [
        section("c1", check: check(correct: [false, true, false])),
        section("c2", check: check(correct: [true, false, false])),
    ])
    let model = consume(store)

    #expect(model.passed == false)
    model.pick(0)
    #expect(model.missed == [0])
    #expect(model.grade == CheckGrade(correct: false, attempt: 1))
    #expect(model.passed == false)

    // A second miss is a second event — the haptic reads the attempt, not the
    // verdict, or a learner who misses twice feels nothing the second time.
    model.pick(2)
    #expect(model.grade?.attempt == 2)
    // An option already spent can't be picked again.
    model.pick(0)
    #expect(model.grade?.attempt == 2)

    model.pick(1)
    #expect(model.passed)
    // Once found, the answer stands: a stray tap can't un-pass the section.
    model.pick(0)
    #expect(model.passed)

    model.advance()
    #expect(model.index == 1)
    #expect(model.picked == nil)
    #expect(model.missed.isEmpty)
    #expect(model.grade == nil)
    #expect(model.passed == false)
}

@MainActor
@Test func theReadingResumesWhereItWasLeftRatherThanAtSectionOne() {
    let store = store()
    reading(store, [
        section("c1", check: check(correct: [true, false, false])),
        section("c2", check: check(correct: [true, false, false])),
        section("c3"),
    ])

    let first = consume(store)
    first.pick(0)
    first.advance()
    #expect(first.index == 1)

    // A phone call, a pop back to the map, a re-entry: the pass is the longest
    // surface in Atlas, and starting it over is re-reading ten minutes of prose.
    let second = consume(store)
    #expect(second.index == 1)
    // And the section already answered stays answered.
    #expect(store.reading("lat")?.checks.contains("c1") == true)

    second.pick(0)
    second.advance()
    let third = consume(store)
    #expect(third.index == 2)
    #expect(third.rail.count == 3)
}

@MainActor
@Test func theRailNeverShrinksUnderTheLearner() {
    let store = store()
    reading(store, [section("c1"), section("c2"), section("c3")])
    let model = consume(store)
    model.advance()
    #expect(model.rail.count == 3)

    // The pass is regenerated and only one section has landed so far. The rail
    // holds its high-water mark rather than collapsing to a single segment.
    store.warm.clear()
    reading(store, [section("c1")])
    #expect(consume(store).rail.count == 3)
}

@MainActor
@Test func aDayOnTheStreakIsWorkAndNotAMountedScreen() {
    let held = (Defaults.streak, Defaults.lastActiveDay)
    defer { (Defaults.streak, Defaults.lastActiveDay) = held }
    Defaults.streak = 0
    Defaults.lastActiveDay = ""

    let store = store()
    // Opening a node, seeing the wrong phase and backing out is not a day: a
    // streak is adherence, and mounting a screen is not adherence.
    let pass = SessionViewModel(node: store.graph.nodes[0], store: store)
    #expect(store.streak == 0)
    // Getting somewhere is.
    pass.advance()
    #expect(store.streak == 1)
}

@MainActor
@Test func aRedoCanNeverLandOnTheReviewPhase() {
    let store = store()
    // `.retained` belongs to the Review tab. This shell hides the tab bar, the
    // nav bar and the back button, so a route that asked for it here would push
    // a screen with no way out.
    let pass = SessionViewModel(node: store.graph.nodes[0], store: store, phase: .retained)
    #expect(pass.phase == .crucible)
}

@MainActor
@Test func theLensCarriesTheSectionOnScreenAndStopsTheReadAloud() {
    let store = store()
    reading(store, [section("c1"), section("c2")])
    let model = consume(store)
    model.open(.analogy)

    let request = try! #require(model.lens)
    #expect(request.chunk.id == "c1")
    #expect(request.context["lens"] == .string("analogy"))
    #expect(request.context["takeaway"] == .string("O ponto."))
    // The chip is tapped by someone who did not follow the section; a voice
    // still reading it underneath does not help.
    #expect(model.speaker.speaking == false)

    // The lens reached for twice is the one marked on every later section.
    #expect(store.preferredLens == nil)
    model.open(.analogy)
    #expect(store.preferredLens == .analogy)
}

@Test func readAloudIsPackedIntoRequestsUnderTheRoutesCap() {
    // `/api/speech` refuses anything over 4 000 characters, and a
    // five-paragraph section is over it — which used to fail in silence.
    let long = String(repeating: "Uma frase inteira. ", count: 400)
    let clips = Speaker.batched([long], limit: 3_500)
    #expect(clips.count > 1)
    #expect(clips.allSatisfy { $0.count <= 3_500 })
    // Nothing is dropped on the way through.
    #expect(clips.joined(separator: " ").count >= long.trimmed.count - clips.count)

    // Short paragraphs travel together rather than as one request each.
    #expect(Speaker.batched(["Um.", "Dois.", "Três."]).count == 1)
    #expect(Speaker.batched(["", "   "]).isEmpty)
}

/// The model writes markdown emphasis into its prose. `Text(verbatim:)` printed
/// the markers; the voice read them out. Both go through `Markdown` now, so
/// this is the one check that keeps the two halves the same string.
@Suite("Markdown na leitura")
struct MarkdownTests {
    @Test("os marcadores de ênfase somem do que se lê e do que se fala")
    func stripsEmphasis() {
        let written = "vetores que *geram* o espaço e são **independentes**"
        #expect(Markdown.plain(written) == "vetores que geram o espaço e são independentes")
        // What the screen draws is the same characters, styled — never the
        // markers, and never the fallback of showing the raw string.
        #expect(String(Markdown.rich(written).characters) == Markdown.plain(written))
    }

    @Test("prosa sem marcação atravessa intacta, espaços inclusive")
    func leavesPlainProseAlone() {
        let plain = "Se v = (1, 2) e w = (-2, -4), então w = -2·v."
        #expect(Markdown.plain(plain) == plain)
    }
}
