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

    /// One frame per line, yielded as it lands. Partial frames are redraws —
    /// render them, never assemble or cache them.
    func frames(_ request: any HTTPRequest) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let urlRequest = try request.makeURLRequest(baseURL: baseURL)
                    let (bytes, response) = try await session.bytes(for: urlRequest)
                    try check(response)
                    for try await line in bytes.lines where !line.isEmpty {
                        let frame = try JSONDecoder().decode(StreamFrame.self, from: Data(line.utf8))
                        guard frame.p != StreamFrame.errorPart else {
                            throw AtlasError(code: "upstream", message: "stream died mid-flight", status: 200)
                        }
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
    private func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse,
              !(200..<300).contains(http.statusCode) else { return }
        throw AtlasError(
            code: codeForStatus(http.statusCode),
            message: "stream refused (\(http.statusCode))",
            status: http.statusCode,
            requestId: http.value(forHTTPHeaderField: "x-atlas-request-id")
        )
    }
}
