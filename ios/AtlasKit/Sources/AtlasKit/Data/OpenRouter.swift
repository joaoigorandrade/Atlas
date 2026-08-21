import Foundation

/// OpenRouter, from the device. A port of the transport half of
/// `lib/server/openrouter.ts` — the same request shape, the same two deadlines,
/// the same streaming-JSON scanning — so a kind moved off `/api/generate` keeps
/// producing exactly the frames the screens already read.
///
/// What is deliberately *not* here: the fallback model chain, the retry ladder
/// across models, the spend log and the shared `content_cache`. Those are the
/// server's, and they stay the server's — this is the development-phase path
/// (`Secrets.swift`), not a second production engine.
///
/// ponytail: one model, one corrective retry, no chain. The chain exists on the
/// server for provider outages; a laptop build can just be re-run.
public actor OpenRouter {
    private let key = Secrets.openRouterKey
    private let model = Secrets.openRouterModel
    private let session: URLSession

    public init(session: URLSession = .shared) { self.session = session }

    /// Content is writing; judging is classification. Same split, same numbers
    /// as the server: a verdict must not wander between samples.
    public enum Role: Sendable {
        case content, judge
        var temperature: Double { self == .judge ? 0 : 0.6 }
    }

    public struct Message: Encodable, Sendable {
        public let role: String
        public let content: String
        public init(role: String, content: String) {
            self.role = role
            self.content = content
        }
    }

    /// Caps the silence before the first token. A mute model is the failure a
    /// whole-request deadline waits out — and so does the learner.
    private static let firstTokenSeconds: TimeInterval = 25
    /// Caps the whole call, including a model that streams forever.
    private static let requestSeconds: TimeInterval = 90

    // MARK: - One-shot JSON

    /// Ask for one JSON object and decode it. A decode failure is retried once
    /// with the reply and the error appended, exactly as `generateJson` does —
    /// the model cannot correct output it can't see.
    public func json<T: Decodable & Sendable>(
        _ messages: [Message], label: String, role: Role = .content
    ) async throws -> T {
        var conversation = messages
        var lastFailure: String?
        for attempt in 0..<2 {
            let reply = try await complete(conversation, role: role)
            do {
                return try JSONDecoder().decode(T.self, from: Self.extractJSON(reply))
            } catch {
                lastFailure = String(describing: error)
                guard attempt == 0 else { break }
                conversation = messages + [
                    Message(role: "assistant", content: String(reply.prefix(8000))),
                    Message(role: "user", content: """
                        Your previous reply failed validation: \(lastFailure ?? ""). Reply again \
                        with ONLY the corrected JSON object — keep everything that was already \
                        right and change only what the error names.
                        """),
                ]
            }
        }
        throw AtlasError(
            code: "upstream",
            message: "\(label): the model's JSON failed validation twice: \(lastFailure ?? "")"
        )
    }

    /// One non-streamed completion.
    private func complete(_ messages: [Message], role: Role) async throws -> String {
        var request = try self.request(messages, role: role, stream: false)
        request.timeoutInterval = Self.requestSeconds
        let (data, response) = try await send(request)
        try Self.check(response, data)
        struct Reply: Decodable {
            struct Choice: Decodable {
                struct Message: Decodable { let content: String? }
                let message: Message?
            }
            let choices: [Choice]?
        }
        guard let content = try? JSONDecoder().decode(Reply.self, from: data).choices?.first?.message?.content,
              !content.isEmpty
        else {
            throw AtlasError(code: "upstream", message: "OpenRouter returned an empty completion")
        }
        return content
    }

    // MARK: - Streamed objects

    /// One object off the stream: complete, or a redraw of the one still being
    /// written (same index, `partial: true`).
    public struct Streamed: Sendable {
        public let value: JSONValue
        public let index: Int
        public let partial: Bool
    }

    /// How often a still-being-written object is re-sent. Each redraw carries
    /// the whole object, so per-token frames would cost O(n²) bytes for prose.
    private static let partialInterval: TimeInterval = 0.066

    /// Stream a completion expected to hold a sequence of top-level JSON
    /// objects — not one wrapping object — and yield each as its closing brace
    /// lands. With `partial`, the object mid-write is also yielded on a timer.
    ///
    /// No corrective retry: a validation failure mid-stream can't be redone in
    /// place. The caller falls back to the one-shot path, which is retried.
    public nonisolated func objects(
        _ messages: [Message], role: Role = .content, partial: Bool = false
    ) -> AsyncThrowingStream<Streamed, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await self.pump(messages, role: role, partial: partial) {
                        continuation.yield($0)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func pump(
        _ messages: [Message], role: Role, partial wantsPartial: Bool,
        emit: (Streamed) -> Void
    ) async throws {
        var request = try self.request(messages, role: role, stream: true)
        // URLSession's own timeout is the silence between bytes, which is the
        // first-token deadline once the stream is running; the total is held
        // below, since a stream that never stops never trips a byte timeout.
        request.timeoutInterval = Self.firstTokenSeconds
        let started = Date()
        let (bytes, response) = try await session.bytes(for: request)
        try Self.check(response, Data())

        var buffer = ""
        var index = 0
        var lastPartial = Date.distantPast
        // One decoder for the whole stream. Every SSE line decodes an envelope
        // and every closing brace decodes an object — building a `JSONDecoder`
        // for each was the per-token cost of this loop.
        let decoder = JSONDecoder()
        for try await line in bytes.lines {
            if Date().timeIntervalSince(started) > Self.requestSeconds {
                throw AtlasError(code: "upstream", message: "OpenRouter exceeded the total timeout")
            }
            guard let delta = Self.delta(from: line, decoder) else { continue }
            buffer += delta

            let (complete, rest) = Self.extractCompleteObjects(buffer)
            buffer = rest
            for object in complete {
                guard let value = try? decoder.decode(JSONValue.self, from: Data(object.utf8)) else { continue }
                emit(Streamed(value: value, index: index, partial: false))
                index += 1
            }

            guard wantsPartial, !buffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  Date().timeIntervalSince(lastPartial) >= Self.partialInterval,
                  let draft = Self.closePartialJSON(buffer)
            else { continue }
            lastPartial = Date()
            emit(Streamed(value: draft, index: index, partial: true))
        }
        // A stream that ends cleanly having produced nothing is a failure, not
        // an empty answer — it is what a model returns when it refuses the
        // prompt shape, and it is what routes the caller into its fallback.
        if index == 0 {
            throw AtlasError(code: "upstream", message: "the model streamed no JSON objects")
        }
    }

    /// One SSE line to its content delta, or nil for keep-alives and `[DONE]`.
    private static func delta(from line: String, _ decoder: JSONDecoder) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("data:") else { return nil }
        let payload = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
        guard payload != "[DONE]" else { return nil }
        struct Event: Decodable {
            struct Choice: Decodable {
                struct Delta: Decodable { let content: String? }
                let delta: Delta?
            }
            let choices: [Choice]?
        }
        // A malformed frame (rare keep-alive/comment) is skipped, not fatal.
        return try? decoder.decode(Event.self, from: Data(payload.utf8))
            .choices?.first?.delta?.content
    }

    // MARK: - Transport

    private func request(_ messages: [Message], role: Role, stream: Bool) throws -> URLRequest {
        struct Body: Encodable {
            let model: String
            let messages: [Message]
            let temperature: Double
            let stream: Bool
            let response_format: [String: String]?
        }
        var request = URLRequest(url: URL(string: "https://openrouter.ai/api/v1/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Atlas iOS", forHTTPHeaderField: "X-Title")
        request.httpBody = try JSONEncoder().encode(Body(
            model: model,
            messages: messages,
            temperature: role.temperature,
            stream: stream,
            // Most models honor this; the ones that don't still get the "JSON
            // only" instruction in the system prompt. Never sent on a stream —
            // the stream's own shape is a sequence of objects, not one.
            response_format: stream ? nil : ["type": "json_object"]
        ))
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw AtlasError.transport(error)
        }
    }

    /// A non-2xx from OpenRouter. 401/402 are the operator's problem — a bad
    /// key or an empty balance — and say so rather than hiding behind "busy".
    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        let detail = String(data: data, encoding: .utf8)?.prefix(300) ?? ""
        throw AtlasError(
            code: http.statusCode == 429 ? "rate_limit" : "upstream",
            message: http.statusCode == 401 || http.statusCode == 402
                ? "OpenRouter rejected the key in Secrets.swift (\(http.statusCode)) — check it and the account balance"
                : "OpenRouter \(http.statusCode): \(detail)",
            status: http.statusCode
        )
    }

    // MARK: - JSON scanning (a port of the same functions in openrouter.ts)

    /// The first JSON object in a completion, fences and prose tolerated.
    static func extractJSON(_ text: String) throws -> Data {
        var body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if body.hasPrefix("```") {
            body = body.drop(while: { $0 != "\n" }).trimmingCharacters(in: .whitespacesAndNewlines)
            if let fence = body.range(of: "```", options: .backwards) {
                body = String(body[..<fence.lowerBound])
            }
        }
        guard let start = body.firstIndex(of: "{"), let end = body.lastIndex(of: "}"), start < end else {
            throw AtlasError(code: "upstream", message: "no JSON object found")
        }
        return Data(body[start...end].utf8)
    }

    /// Complete top-level `{...}` objects out of a growing buffer, tolerant of
    /// whitespace and commas between them and of braces inside strings.
    static func extractCompleteObjects(_ buffer: String) -> (objects: [String], rest: String) {
        var objects: [String] = []
        var depth = 0
        var start: String.Index?
        var lastEnd = buffer.startIndex
        var inString = false
        var escaped = false
        var i = buffer.startIndex
        while i < buffer.endIndex {
            let ch = buffer[i]
            defer { i = buffer.index(after: i) }
            if inString {
                if escaped { escaped = false }
                else if ch == "\\" { escaped = true }
                else if ch == "\"" { inString = false }
                continue
            }
            switch ch {
            case "\"": inString = true
            case "{":
                if depth == 0 { start = i }
                depth += 1
            case "}":
                depth -= 1
                if depth == 0, let from = start {
                    let end = buffer.index(after: i)
                    objects.append(String(buffer[from..<end]))
                    lastEnd = end
                    start = nil
                }
            default: break
            }
        }
        return (objects, String(buffer[lastEnd...]))
    }

    /// Close an in-progress object so half of one can be rendered while the
    /// rest is written. Lossy on purpose: the result is only ever drawn, never
    /// validated into a payload and never cached.
    static func closePartialJSON(_ buffer: String) -> JSONValue? {
        guard let start = buffer.firstIndex(of: "{") else { return nil }
        var text = String(buffer[start...])
        for _ in 0..<3 {
            if let closed = closeOpenStructures(text),
               let value = try? JSONDecoder().decode(JSONValue.self, from: Data(closed.utf8)) {
                // An object with nothing in it yet is not a redraw worth sending.
                if case .object(let fields) = value, fields.isEmpty { return nil }
                return value
            }
            guard let cut = lastCommaOutsideString(text) else { return nil }
            text = String(text[..<cut])
        }
        return nil
    }

    /// Append the closers for every structure left open, after trimming the
    /// trailing fragment that can't stand on its own — a dangling `,` or `key:`.
    private static func closeOpenStructures(_ text: String) -> String? {
        var closers: [Character] = []
        var inString = false
        var escaped = false
        for ch in text {
            if inString {
                if escaped { escaped = false }
                else if ch == "\\" { escaped = true }
                else if ch == "\"" { inString = false }
                continue
            }
            switch ch {
            case "\"": inString = true
            case "{": closers.append("}")
            case "[": closers.append("]")
            case "}", "]": _ = closers.popLast()
            default: break
            }
        }
        guard !closers.isEmpty else { return nil }
        // A trailing backslash would escape the quote about to be added.
        var body = escaped ? String(text.dropLast()) : text
        if inString { body += "\"" }
        body = Self.trimTrailingSpace(body)
        // `{"a": 1,` and `{"a":` are both un-closable as they stand: a trailing
        // comma just goes, a trailing colon takes its key with it.
        while true {
            if body.hasSuffix(",") {
                body = Self.trimTrailingSpace(String(body.dropLast()))
                continue
            }
            guard body.hasSuffix(":") else { break }
            if let cut = lastCommaOutsideString(body) {
                body = Self.trimTrailingSpace(String(body[..<cut]))
            } else if let brace = body.lastIndex(of: "{") {
                body = Self.trimTrailingSpace(String(body[...brace]))
            } else {
                return nil
            }
        }
        return body + String(closers.reversed())
    }

    /// Two full reversals of the buffer per call was the old shape of this; the
    /// suffix is all that ever changes.
    private static func trimTrailingSpace(_ text: String) -> String {
        var body = text
        while let last = body.last, last.isWhitespace { body.removeLast() }
        return body
    }

    /// The last comma that isn't inside a string literal.
    private static func lastCommaOutsideString(_ text: String) -> String.Index? {
        var inString = false
        var escaped = false
        var last: String.Index?
        var i = text.startIndex
        while i < text.endIndex {
            let ch = text[i]
            defer { i = text.index(after: i) }
            if inString {
                if escaped { escaped = false }
                else if ch == "\\" { escaped = true }
                else if ch == "\"" { inString = false }
                continue
            }
            if ch == "\"" { inString = true }
            else if ch == "," { last = i }
        }
        return last
    }
}
