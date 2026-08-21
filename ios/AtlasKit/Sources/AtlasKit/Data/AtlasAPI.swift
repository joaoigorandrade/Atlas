import Foundation
import Networking

/// The one seam every generation goes through. There is no second HTTP call
/// site in the app: adding a kind means adding a method here.
///
/// Unary requests run through `Networking`'s `URLSessionNetworkClient`; the
/// streamed ones go through `NDJSONStreamer`, which builds the same
/// `HTTPRequest` values and reads the bytes as they land.
public actor AtlasAPI {
    private let client: URLSessionNetworkClient
    private let streamer: NDJSONStreamer
    /// The device's own content engine. A kind `Prompts` has ported runs here;
    /// everything else still goes to `/api/generate`, which is why the two can
    /// coexist mid-port.
    private let openRouter = OpenRouter()
    /// The Supabase access token. `/api/generate` requires a signed-in learner.
    private var accessToken: String?

    public init(baseURL: URL, session: URLSession = .shared) {
        client = URLSessionNetworkClient(
            baseURL: baseURL,
            session: session,
            // The status is read here rather than thrown by the client: a 4xx
            // body carries the `code` a screen speaks and the header carries the
            // request id a log needs, and `NetworkError.httpError` drops both.
            successStatusCodes: 0..<600,
            logger: AtlasLog.logger
        )
        streamer = NDJSONStreamer(baseURL: baseURL, session: session)
    }

    public func setAccessToken(_ token: String?) { accessToken = token }

    /// Execute and classify. Every unary request in the app lands here, so this
    /// is the only place a transport failure becomes an `AtlasError`.
    private func send(_ request: any HTTPRequest) async throws -> NetworkResponse {
        let response: NetworkResponse
        do {
            response = try await client.execute(request)
        } catch {
            throw AtlasError.transport(error)
        }
        guard (200..<300).contains(response.statusCode) else { throw AtlasError.http(response) }
        return response
    }

    /// Non-streamed generation. Returns the decoded payload for `kind`.
    public func generate<T: Decodable>(_ kind: String, _ context: [String: JSONValue] = [:]) async throws -> T {
        var body = context
        body["kind"] = .string(kind)
        let response = try await send(try AtlasEndpoint.generate(body, token: accessToken))
        do {
            return try JSONDecoder().decode(T.self, from: response.data)
        } catch {
            throw AtlasError(code: "upstream", message: "could not decode \(kind): \(error)")
        }
    }

    /// Streamed generation: one frame per line, yielded as it lands so a screen
    /// paints on its first item instead of its last.
    public func stream(_ kind: String, _ context: [String: JSONValue] = [:]) -> AsyncThrowingStream<StreamFrame, Error> {
        if let ported = Prompts.streamed(kind, context) { return frames(ported) }
        var body = context
        body["kind"] = .string(kind)
        body["stream"] = .bool(true)
        guard let request = try? AtlasEndpoint.generate(body, token: accessToken) else {
            return AsyncThrowingStream {
                $0.finish(throwing: AtlasError(code: "request", message: "could not encode \(kind) context"))
            }
        }
        return streamer.frames(request)
    }

    /// The same frames `/api/generate` would have sent, produced here: one
    /// object off OpenRouter per list item, in the part the screen reads.
    ///
    /// The id is stamped on rather than asked for — `validateConsumeSection`
    /// and `validateSocraticStep` assign `c1`, `s1`, … server-side, the model
    /// never writes one, and the screens key their views on it.
    private nonisolated func frames(_ ported: Prompts.Streamed) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await object in openRouter.objects(ported.messages) {
                        continuation.yield(StreamFrame(
                            p: ported.part,
                            i: object.index,
                            v: object.value.withId("\(ported.idPrefix)\(object.index + 1)"),
                            partial: object.partial ? true : nil
                        ))
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
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
            let task = Task {
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
            continuation.onTermination = { _ in task.cancel() }
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
            let task = Task {
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
            continuation.onTermination = { _ in task.cancel() }
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
    /// draft. Feed the partials through if the wait ever reads as a hang.
    public func judge<T: Decodable & Sendable>(_ mode: String, _ context: [String: JSONValue]) async throws -> T {
        var body = context
        body["mode"] = .string(mode)
        var verdict: T?
        for try await frame in stream("judge", body) where frame.p == "judgement" && frame.partial != true {
            verdict = try frame.v.decode(T.self)
        }
        guard let verdict else {
            throw AtlasError(code: "upstream", message: "the judge returned nothing")
        }
        return verdict
    }

    // MARK: - Retain (screen 19)

    /// The day's new cards. A card factory, not a queue: it is asked only about
    /// nodes that have none yet, and what it returns is scheduled locally from
    /// then on.
    public func retain(topic: String, budgetMin: Int, nodes: [(id: String, label: String, state: NodeState)],
                       interests: String, language: String = AtlasAPI.language) async throws -> [ReviewCard] {
        let wrapped: Wrapped<RetainContent> = try await generate("retain", [
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

    /// Delete the account and every row behind it. The server wipes the data;
    /// the caller signs out.
    public func deleteAccount() async throws {
        _ = try await send(AtlasEndpoint.deleteAccount(token: accessToken))
    }

    // MARK: - Read-aloud

    /// One segment of prose, synthesized. The response also carries per-word
    /// timing; nothing on mobile reads along yet, so only the audio is decoded.
    /// ponytail: no marks — add them when a screen highlights the spoken word.
    public func speech(_ text: String, language: String = AtlasAPI.language) async throws -> Data {
        struct Clip: Decodable { let audio: String }
        let response = try await send(
            try AtlasEndpoint.speech(text: text, language: language, token: accessToken)
        )
        let clip = try JSONDecoder().decode(Clip.self, from: response.data)
        guard let audio = Data(base64Encoded: clip.audio) else {
            throw AtlasError(code: "upstream", message: "speech response carried no audio")
        }
        return audio
    }

    /// The language content is generated in — the device's until screen 13
    /// says otherwise. Written only from the settings screen (main actor), read
    /// from every context builder, which is why the write is stated unsafe
    /// rather than wrapped in a lock nothing contends for.
    public nonisolated(unsafe) static var language: String = deviceLanguage

    /// The bundle's own language, not the device's raw locale: the interface
    /// is localised by the String Catalogue, and iOS lets a learner set a
    /// language for *this app* alone. Reading what the app is actually being
    /// drawn in keeps the prose the model writes in the language on screen.
    public nonisolated static var deviceLanguage: String {
        Bundle.main.preferredLocalizations.first?.hasPrefix("pt") == true ? "pt-BR" : "en"
    }

    /// The two languages screen 13 offers — the same pair the web app ships.
    public static let languages = ["pt-BR", "en"]
}

/// Request and response bodies are the learner's own material. The package
/// redacts credentials, but the prose is theirs — it only ever goes to a debug
/// console, never to a shipped build's log.
enum AtlasLog {
    static var logger: (any NetworkLogging)? {
        #if DEBUG
        ConsoleNetworkLogger()
        #else
        nil
        #endif
    }
}
