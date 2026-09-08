import Foundation
import Testing
@testable import AtlasKit

/// `finish()` is the one write that ends onboarding, and everything it forgets
/// is invisible: a gap with no state paints grey and reads "Bloqueado", and a
/// second map under a subject the learner already has replaces that run's whole
/// row. Both are pinned here, over the real stream.

/// Answers `/api/generate`: the map as NDJSON frames, the placement question as
/// one object. Enough of the server for the state machine to run end to end.
private final class Stub: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    /// `URLProtocol` moves an uploaded body onto the stream, so `httpBody` is
    /// nil by the time it arrives here.
    private var kind: String {
        var data = request.httpBody
        if data == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var bytes = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                guard read > 0 else { break }
                bytes.append(contentsOf: buffer[0..<read])
            }
            data = bytes
        }
        let body = String(data: data ?? Data(), encoding: .utf8) ?? ""
        return body.contains("diagnosticQuestion") ? "diagnosticQuestion" : "curriculum"
    }

    static let nodeIds = ["a", "b", "c", "d", "e"]
    static let gapId = "cadeia-gap"

    override func startLoading() {
        let body: String = if kind == "diagnosticQuestion" {
            """
            {"tag":"Regra da cadeia","q":"?","note":"n","nodeId":"c","difficulty":"medium",
             "opts":[{"label":"certa"},{"label":"errada"}],"correctIndex":0,
             "gap":{"id":"\(Self.gapId)","label":"Derivar de dentro para fora","reason":"r","dx":40,"dy":30}}
            """
        } else {
            // One frame per concept, the shape `NDJSONStreamer` reads.
            Self.nodeIds.enumerated().map { index, id in
                #"{"p":"nodes","i":\#(index),"v":{"id":"\#(id)","label":"\#(id)","g":\#(index),"week":0,"x":0,"y":0,"prereqs":[]}}"#
            }.joined(separator: "\n")
        }
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor private func onboarding() -> (OnboardingViewModel, AtlasStore) {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!, session: URLSession(configuration: config)),
        auth: AtlasAuth()
    )
    return (OnboardingViewModel(store: store), store)
}

/// Waits for `stage` to settle on the placement — the build sleeps out its
/// assembly beat, and the question lands behind it.
@MainActor private func waitForPlacement(_ model: OnboardingViewModel) async {
    for _ in 0..<80 where model.question == nil {
        try? await Task.sleep(for: .milliseconds(100))
    }
}

@MainActor
@Test func theCommitCarriesTheGapItsStateAndWhyTheNodeIsShaky() async {
    let (model, store) = onboarding()
    model.form.topic = "Cálculo I"
    model.buildMap()
    await waitForPlacement(model)
    #expect(model.stage == .placement)

    model.takePlacement()
    // A miss at medium with nothing harder proven is a genuine gap, not a slip.
    model.answer(1)
    model.finish()

    #expect(store.states[Stub.gapId] == .gap)
    // The one derivation every surface reads: a gap with no stored state comes
    // back `.unknown` here, which is the whole bug.
    #expect(store.display[Stub.gapId] == .gap)
    #expect(store.states["c"] == .shaky)
    #expect(store.shakyReasons["c"] == .diagnosticHesitation)
    // The map was generated in this language, so the run records it.
    #expect(store.language == AtlasAPI.language)
    #expect(store.subject == "Cálculo I")

    // The dock can call `finish()` twice; the second one must not write over a
    // run the learner has already started working in.
    store.states["c"] = .mastered
    model.finish()
    #expect(store.states["c"] == .mastered)
}

@MainActor
@Test func asecondMapUnderAsubjectAlreadyInTheLibraryIsRefused() {
    let (model, store) = onboarding()
    store.library = [try! JSONDecoder().decode(AtlasRun.self, from: Data(#"{"id":"t1","subject":"Cálculo I","graph":{"nodes":[],"edges":[]}}"#.utf8))]
    // Normalised the same way `finish()` normalises it: the collision is on the
    // row's key, not on what was typed.
    model.form.topic = "  Cálculo I  "
    model.buildMap()

    #expect(model.stage == .welcome)
    #expect(!model.message.isEmpty)
    #expect(store.subject.isEmpty)
}
