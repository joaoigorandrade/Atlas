import Foundation
import Networking

/// `NetworkClient` buffers a whole response before it answers, which is exactly
/// wrong for `/api/generate`: the point of a streamed kind is that a screen
/// paints on its first frame instead of its last. So the streaming half builds
/// its `URLRequest` from the same `HTTPRequest` value the unary half uses, and
/// reads `URLSession.bytes` directly.
///
/// ponytail: no client protocol and no interceptor chain for one call site —
/// give it both when a second streaming endpoint exists.
struct NDJSONStreamer: Sendable {
    let baseURL: URL
    let session: URLSession

    /// Caps the silence between bytes. `URLSession`'s own 60s default is the
    /// wrong bound for a generation: the map sends nothing at all while the
    /// model reasons — 90 seconds of it, on a cold topic — and the default
    /// counted that as a dead connection and killed a request the server was
    /// still answering. The only honest bound is the route's `maxDuration`
    /// (`app/api/generate/route.ts`), which is what gives up first.
    static let streamSeconds: TimeInterval = 310

    /// One frame per line, yielded as it lands. Partial frames are redraws —
    /// render them, never assemble or cache them.
    func frames(_ request: any HTTPRequest) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var urlRequest = try request.makeURLRequest(baseURL: baseURL)
                    urlRequest.timeoutInterval = Self.streamSeconds
                    let (bytes, response) = try await session.bytes(for: urlRequest)
                    try await check(response, bytes)
                    // One decoder for the whole stream: a long generation is
                    // thousands of lines, and each one was building its own.
                    let decoder = JSONDecoder()
                    for try await line in bytes.lines where !line.isEmpty {
                        let frame = try decoder.decode(StreamFrame.self, from: Data(line.utf8))
                        // The terminal frame carries `{code, message, requestId}`
                        // (`lib/server/stream.ts`). Reading it is what lets a quota
                        // or an expired token say so, instead of every mid-stream
                        // death landing on the same generic sentence.
                        guard frame.p != StreamFrame.errorPart else { throw AtlasError.frame(frame.v) }
                        continuation.yield(frame)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            // A screen that goes away mid-generation stops paying for it: the
            // stream's consumer disappearing has to cancel the request, or the
            // task outlives the view that asked for it.
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// A stream that never starts fails like any other request — the body is the
    /// error payload, and it is small enough to read before giving up on it.
    private func check(_ response: URLResponse, _ bytes: URLSession.AsyncBytes) async throws {
        guard let http = response as? HTTPURLResponse,
              !(200..<300).contains(http.statusCode) else { return }
        // The refusal body is `apiError`'s `{code, error}` and the code in it is
        // the one the learner hears — the same body `AtlasError.http` reads on
        // the unary path. Deriving the code from the status alone instead sent
        // an OpenRouter 402 (`code: "upstream"`, "try again in a moment") to the
        // screen as "describe the topic differently", which the learner cannot
        // act on. One line, so `bytes.lines` is enough to hold it.
        var body: [String: String]?
        for try await line in bytes.lines where !line.isEmpty {
            body = try? JSONDecoder().decode([String: String].self, from: Data(line.utf8))
            break
        }
        throw AtlasError(
            code: body?["code"] ?? codeForStatus(http.statusCode),
            message: body?["error"] ?? "stream refused (\(http.statusCode))",
            status: http.statusCode,
            requestId: http.value(forHTTPHeaderField: "x-atlas-request-id")
        )
    }
}
