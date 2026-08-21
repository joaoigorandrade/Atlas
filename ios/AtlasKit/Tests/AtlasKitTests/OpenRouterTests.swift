import Foundation
import Testing
@testable import AtlasKit

/// The streaming-JSON scanner, ported from `lib/server/openrouter.ts` and
/// pinned by the same cases as `tests/streamParser.test.ts`. This is the part
/// of generating on the device that has no server to fall back on: get it
/// wrong and a section either never appears or appears as garbage.

@Test func extractsNothingFromAPartialObject() {
    let (objects, rest) = OpenRouter.extractCompleteObjects(#"{"a": 1, "b":"#)
    #expect(objects.isEmpty)
    #expect(rest == #"{"a": 1, "b":"#)
}

@Test func extractsObjectsArrivingAcrossChunks() {
    let chunk = "{\n  \"a\": 1,\n  \"b\": {\"nested\": true}\n}\n{\"c\":"
    let (objects, rest) = OpenRouter.extractCompleteObjects(chunk)
    #expect(objects == ["{\n  \"a\": 1,\n  \"b\": {\"nested\": true}\n}"])
    #expect(rest.trimmingCharacters(in: .whitespacesAndNewlines) == #"{"c":"#)

    let (more, tail) = OpenRouter.extractCompleteObjects(rest + "2}")
    #expect(more == [#"{"c":2}"#])
    #expect(tail.isEmpty)
}

@Test func ignoresBracesAndQuotesInsideStrings() throws {
    let (objects, rest) = OpenRouter.extractCompleteObjects(
        #"{"body": "a {weird} \"quoted\" sentence"}"#
    )
    #expect(objects.count == 1)
    #expect(rest.isEmpty)
    let decoded = try JSONDecoder().decode(JSONValue.self, from: Data(objects[0].utf8))
    guard case .object(let fields) = decoded, case .string(let body)? = fields["body"] else {
        Issue.record("expected an object with a body")
        return
    }
    #expect(body == #"a {weird} "quoted" sentence"#)
}

/// The redraw path: half an object, closed well enough to render.
@Test func closesAPartialObjectAtEveryCutPoint() {
    func text(_ buffer: String, _ key: String) -> String? {
        guard case .object(let fields)? = OpenRouter.closePartialJSON(buffer),
              case .string(let value)? = fields[key] else { return nil }
        return value
    }
    // An unterminated string mid-word.
    #expect(text(#"{"p": "the mechanism is a feed"#, "p") == "the mechanism is a feed")
    // A dangling key goes; what was already written stays.
    #expect(text(#"{"label": "What it is", "text": "#, "label") == "What it is")
    #expect(text(#"{"label": "What it is", "text""#, "label") == "What it is")
    #expect(text(#"{"label": "What it is","#, "label") == "What it is")
    // Braces and escaped quotes inside a string don't fool it.
    #expect(text(##"{"p": "a {weird} \"quoted\" half"##, "p") == #"a {weird} "quoted" half"#)
    // A buffer cut on an escape character would otherwise escape the quote
    // being appended.
    #expect(text(#"{"p": "line one\"#, "p") == "line one")
}

@Test func closingSalvagesNothingFromNothing() {
    for buffer in ["", "   \n", "{", "{\""] {
        #expect(OpenRouter.closePartialJSON(buffer) == nil)
    }
}

/// Fences and prose around the object are the model ignoring "JSON only".
@Test func unwrapsAFencedCompletion() throws {
    let fenced = "```json\n{\"a\": 1}\n```"
    let decoded = try JSONDecoder().decode(JSONValue.self, from: OpenRouter.extractJSON(fenced))
    guard case .object(let fields) = decoded, case .number(let a)? = fields["a"] else {
        Issue.record("expected {\"a\": 1}")
        return
    }
    #expect(a == 1)
    #expect(throws: AtlasError.self) { try OpenRouter.extractJSON("no object here") }
}

/// The server stamps list-item ids after validating; the device has to too, or
/// nothing `Identifiable` decodes.
@Test func idIsStampedOnlyWhenMissing() {
    guard case .object(let stamped) = JSONValue.object(["kicker": .string("1 · O que é")]).withId("c1"),
          case .string(let id)? = stamped["id"] else {
        Issue.record("expected an id")
        return
    }
    #expect(id == "c1")

    // A kind that does write its own id keeps it.
    guard case .object(let kept) = JSONValue.object(["id": .string("given")]).withId("c1"),
          case .string(let existing)? = kept["id"] else {
        Issue.record("expected the original id")
        return
    }
    #expect(existing == "given")
}

/// What the live model actually sends: a ```json fence, then the objects. The
/// scanner ignores everything outside a top-level `{...}`, so the fence costs
/// nothing — pinned because "JSON only" in the system prompt does not stop it.
@Test func fencedStreamsStillYieldTheirObjects() {
    let streamed = """
    ```json
    {"label": "Gear Shifting", "text": "Gears adjust pedalling effort for the terrain."}
    {"label": "Gear Ratios", "text": "Chainring and cog set the ratio, and so the speed."}
    ```
    """
    let (objects, rest) = OpenRouter.extractCompleteObjects(streamed)
    #expect(objects.count == 2)
    #expect(rest.trimmingCharacters(in: .whitespacesAndNewlines) == "```")
}
