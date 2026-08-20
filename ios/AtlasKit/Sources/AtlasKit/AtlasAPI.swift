import Foundation

/// A classified failure. The `code` is what a screen says something true about;
/// `message` is technical and belongs in a log, never on screen.
public struct AtlasError: Error, Sendable {
    public let code: String
    public let message: String
    public let status: Int?
    public let requestId: String?
}

/// One NDJSON frame from `/api/generate`: a named slot of the eventual payload,
/// optionally indexed, optionally a partial redraw of a slot still being written.
/// Mirrors `StreamFrame` in `lib/server/stream.ts`.
public struct StreamFrame: Decodable, Sendable {
    public let p: String
    public let i: Int?
    public let v: JSONValue
    public let partial: Bool?

    /// Reserved part for a stream that died after committing to a 200.
    public static let errorPart = "__error"
}

/// The one seam every generation goes through. There is no second HTTP call
/// site in the app: adding a kind means adding a method here.
public actor AtlasAPI {
    private let baseURL: URL
    private let session: URLSession
    /// The Supabase access token. `/api/generate` requires a signed-in learner;
    /// native clients send it as a bearer (see ios/PLAN.md — the one server change).
    private var accessToken: String?

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func setAccessToken(_ token: String?) { accessToken = token }

    private func request(_ path: String, body: [String: JSONValue]) throws -> URLRequest {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try JSONEncoder().encode(body)
        return req
    }

    /// Non-streamed generation. Returns the decoded payload for `kind`.
    public func generate<T: Decodable>(_ kind: String, _ context: [String: JSONValue] = [:]) async throws -> T {
        var body = context
        body["kind"] = .string(kind)
        let (data, response) = try await session.data(for: try request("/api/generate", body: body))
        try Self.check(response, data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Streamed generation: one frame per line, yielded as it lands so a screen
    /// paints on its first item instead of its last. Partial frames are redraws —
    /// render them, never assemble or cache them.
    public func stream(_ kind: String, _ context: [String: JSONValue] = [:]) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var body = context
                    body["kind"] = .string(kind)
                    body["stream"] = .bool(true)
                    let (bytes, response) = try await session.bytes(for: try request("/api/generate", body: body))
                    try Self.check(response, nil)
                    for try await line in bytes.lines where !line.isEmpty {
                        let frame = try JSONDecoder().decode(StreamFrame.self, from: Data(line.utf8))
                        guard frame.p != StreamFrame.errorPart else {
                            throw AtlasError(code: "upstream", message: "stream died mid-flight",
                                             status: 200, requestId: nil)
                        }
                        continuation.yield(frame)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Kinds

    /// A scoped sub-map offer: what comes back instead of a map when the topic
    /// is a continent rather than a territory.
    public struct ScopeOffer: Decodable, Sendable {
        public let label: String
        public let note: String
    }

    /// What the map stream produces — concepts as they are written, or the
    /// scope offers that replace them entirely.
    public enum MapEvent: Sendable {
        case nodes([MapNode])
        case scopes([ScopeOffer])
    }

    /// The map, one concept at a time — the only generation in the app that can
    /// never be warmed (its node ids don't exist until it returns) and the one
    /// SPEC §2 asks the learner to *watch*. Each event carries every node so
    /// far, so the canvas paints a real partial map instead of a spinner.
    ///
    /// Frames replace by index, never append: the settling pass re-sends slots
    /// that already landed once a column's height is known.
    public func curriculum(_ form: OnboardingForm, language: String = AtlasAPI.language)
        -> AsyncThrowingStream<MapEvent, Error>
    {
        var context: [String: JSONValue] = [
            "topic": .string(form.topic),
            "goal": .string(form.goal.rawValue),
            "language": .string(language),
        ]
        if form.goal == .pareto { context["paretoPct"] = .number(Double(form.paretoPct)) }

        return AsyncThrowingStream { continuation in
            Task {
                var nodes: [MapNode?] = []
                var scopes: [ScopeOffer?] = []
                do {
                    for try await frame in stream("curriculum", context) {
                        // A partial frame is a half-written concept: a redraw of
                        // prose elsewhere, but not a node anything can place.
                        guard frame.partial != true, let index = frame.i else { continue }
                        switch frame.p {
                        case "nodes":
                            nodes.append(contentsOf: repeatElement(nil, count: max(0, index + 1 - nodes.count)))
                            nodes[index] = try frame.v.decode(MapNode.self)
                            continuation.yield(.nodes(nodes.compactMap { $0 }))
                        case "scopes":
                            scopes.append(contentsOf: repeatElement(nil, count: max(0, index + 1 - scopes.count)))
                            scopes[index] = try frame.v.decode(ScopeOffer.self)
                            continuation.yield(.scopes(scopes.compactMap { $0 }))
                        default: continue
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// One placement question at the given difficulty. Never batched and never
    /// cached: how hard the next one is pitched depends on how this one is
    /// answered, so it can only be asked once the last is graded.
    public func diagnosticQuestion(
        _ form: OnboardingForm,
        pool: [ConceptNode],
        difficulty: DiagnosticDifficulty,
        language: String = AtlasAPI.language
    ) async throws -> DiagnosticQuestion {
        try await generate("diagnosticQuestion", [
            "topic": .string(form.topic),
            "goal": .string(form.goal.rawValue),
            "interests": .string(form.interests),
            "language": .string(language),
            "difficulty": .string(difficulty.rawValue),
            "pool": .array(pool.map { .object(["id": .string($0.id), "label": .string($0.label)]) }),
        ])
    }

    // MARK: - The session phases (screens 14-18)

    /// The progressive kinds all travel the same way: one indexed frame per
    /// item of one named list. Each event carries every item so far, so a
    /// screen paints on its first section instead of its last.
    ///
    /// Partial frames are skipped: they are half-written items, which is a
    /// redraw of prose elsewhere but not something a list can hold.
    private func list<T: Decodable & Sendable>(
        _ kind: String, _ part: String, _ context: [String: JSONValue]
    ) -> AsyncThrowingStream<[T], Error> {
        AsyncThrowingStream { continuation in
            Task {
                var items: [T?] = []
                do {
                    for try await frame in stream(kind, context) {
                        guard frame.p == part, frame.partial != true, let index = frame.i else { continue }
                        items.append(contentsOf: repeatElement(nil, count: max(0, index + 1 - items.count)))
                        items[index] = try frame.v.decode(T.self)
                        continuation.yield(items.compactMap { $0 })
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// The reading pass, one section at a time.
    public func consume(_ context: [String: JSONValue]) -> AsyncThrowingStream<[ConsumeChunk], Error> {
        list("consume", "chunks", context)
    }

    /// One lens over one section — the model view's beats.
    public func model(_ context: [String: JSONValue]) -> AsyncThrowingStream<[ConsumeModelBeat], Error> {
        list("model", "beats", context)
    }

    /// The questioning script, first probe first.
    public func socratic(_ context: [String: JSONValue]) -> AsyncThrowingStream<[SocraticStep], Error> {
        list("socratic", "steps", context)
    }

    /// The teach-back rubric.
    public func feynman(_ context: [String: JSONValue]) -> AsyncThrowingStream<[FeynmanBeat], Error> {
        list("feynman", "beats", context)
    }

    /// Connect and Crucible are the two phases the server answers whole — they
    /// are one object, not a list, so there is nothing to paint progressively.
    private struct Wrapped<T: Decodable>: Decodable { let content: T }

    public func connect(_ context: [String: JSONValue]) async throws -> ElaborationContent {
        let wrapped: Wrapped<ElaborationContent> = try await generate("connect", context)
        return wrapped.content
    }

    public func crucible(_ context: [String: JSONValue]) async throws -> CrucibleContent {
        let wrapped: Wrapped<CrucibleContent> = try await generate("crucible", context)
        return wrapped.content
    }

    /// A verdict on the learner's own words. The judge streams — the verdict
    /// lands first and the critique is written into the same slot after it —
    /// so the answer is the *last* complete frame, never the first.
    ///
    /// ponytail: the screen waits for that last frame rather than painting the
    /// draft. Feed `onDraft` the partials if the wait ever reads as a hang.
    public func judge<T: Decodable & Sendable>(_ mode: String, _ context: [String: JSONValue]) async throws -> T {
        var body = context
        body["mode"] = .string(mode)
        var verdict: T?
        for try await frame in stream("judge", body) where frame.p == "judgement" && frame.partial != true {
            verdict = try frame.v.decode(T.self)
        }
        guard let verdict else {
            throw AtlasError(code: "upstream", message: "the judge returned nothing", status: nil, requestId: nil)
        }
        return verdict
    }

    // MARK: - Retain (screen 19)

    /// The day's new cards. A card factory, not a queue: it is asked only about
    /// nodes that have none yet, and what it returns is scheduled locally from
    /// then on.
    public func retain(topic: String, budgetMin: Int, nodes: [(id: String, label: String, state: NodeState)],
                       interests: String, language: String = AtlasAPI.language) async throws -> [ReviewCard] {
        struct Wrapped: Decodable { let content: RetainContent }
        let wrapped: Wrapped = try await generate("retain", [
            "topic": .string(topic),
            "budgetMin": .number(Double(budgetMin)),
            "interests": .string(interests),
            "language": .string(language),
            "nodes": .array(nodes.map {
                .object(["id": .string($0.id), "label": .string($0.label), "state": .string($0.state.rawValue)])
            }),
        ])
        return wrapped.content.cards
    }

    // MARK: - The account

    /// Delete the account and every row behind it (`/api/account/delete`). The
    /// server wipes the data; the caller signs out.
    public func deleteAccount() async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/account/delete"))
        request.httpMethod = "POST"
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        try Self.check(response, data)
    }

    // MARK: - Read-aloud

    /// One segment of prose, synthesized. The response also carries per-word
    /// timing; nothing on mobile reads along yet, so only the audio is decoded.
    /// ponytail: no marks — add them when a screen highlights the spoken word.
    public func speech(_ text: String, language: String = AtlasAPI.language) async throws -> Data {
        struct Clip: Decodable { let audio: String }
        var request = URLRequest(url: baseURL.appending(path: "/api/speech"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(["text": text, "language": language])
        let (data, response) = try await session.data(for: request)
        try Self.check(response, data)
        let clip = try JSONDecoder().decode(Clip.self, from: data)
        guard let audio = Data(base64Encoded: clip.audio) else {
            throw AtlasError(code: "upstream", message: "speech response carried no audio",
                             status: nil, requestId: nil)
        }
        return audio
    }

    /// The language content is generated in — the device's until screen 13
    /// says otherwise. Written only from the settings screen (main actor), read
    /// from every context builder, which is why the write is stated unsafe
    /// rather than wrapped in a lock nothing contends for.
    public nonisolated(unsafe) static var language: String = deviceLanguage

    public nonisolated static var deviceLanguage: String {
        Locale.current.language.languageCode?.identifier == "pt" ? "pt-BR" : "en"
    }

    /// The two languages screen 13 offers — the same pair the web app ships.
    public static let languages = ["pt-BR", "en"]

    private static func check(_ response: URLResponse, _ data: Data?) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200..<300).contains(http.statusCode) else { return }
        let requestId = http.value(forHTTPHeaderField: "x-atlas-request-id")
        let body = data.flatMap { try? JSONDecoder().decode([String: String].self, from: $0) }
        throw AtlasError(
            code: body?["code"] ?? codeForStatus(http.statusCode),
            message: body?["error"] ?? "request failed (\(http.statusCode))",
            status: http.statusCode,
            requestId: requestId
        )
    }
}

func codeForStatus(_ status: Int) -> String {
    switch status {
    case 401, 403: "auth"
    case 429: "rate_limit"
    case 400..<500: "request"
    default: "upstream"
    }
}

/// Minimal JSON value — generated payloads are heterogeneous and only the screen
/// that renders one knows its shape.
public enum JSONValue: Codable, Sendable {
    case string(String), number(Double), bool(Bool), null
    case array([JSONValue]), object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    /// Decode a frame's value into the concrete shape the screen renders.
    public func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: try JSONEncoder().encode(self))
    }
}
