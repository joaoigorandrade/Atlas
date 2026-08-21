import Foundation
import Networking

/// A classified failure. The `code` is what a screen says something true about;
/// `message` is technical and belongs in a log, never on screen.
public struct AtlasError: Error, Sendable {
    public let code: String
    public let message: String
    public let status: Int?
    public let requestId: String?

    public init(code: String, message: String, status: Int? = nil, requestId: String? = nil) {
        self.code = code
        self.message = message
        self.status = status
        self.requestId = requestId
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

extension AtlasError {
    /// The transport failures `URLSessionNetworkClient` classifies for us. They
    /// are all "the server didn't answer", which is one sentence to the learner
    /// — the distinction is only worth keeping in the log line.
    static func transport(_ error: Error) -> AtlasError {
        guard let network = error as? NetworkError else {
            return AtlasError(code: "upstream", message: String(describing: error))
        }
        switch network {
        case .cancelled: return AtlasError(code: "cancelled", message: "request cancelled")
        case .timeout: return AtlasError(code: "upstream", message: "request timed out")
        case .noInternetConnection: return AtlasError(code: "offline", message: "no connection")
        default: return AtlasError(code: "upstream", message: String(describing: network))
        }
    }

    /// A response the app got but can't use. `NetworkResponse` is only handed
    /// here once the status is known to be outside 2xx.
    static func http(_ response: NetworkResponse) -> AtlasError {
        let body = try? JSONDecoder().decode([String: String].self, from: response.data)
        return AtlasError(
            code: body?["code"] ?? codeForStatus(response.statusCode),
            message: body?["error"] ?? "request failed (\(response.statusCode))",
            status: response.statusCode,
            requestId: response.headers["x-atlas-request-id"]
        )
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

    /// Stamp an `id` on an object that has none. The server assigns list-item
    /// ids after validating (`c1`, `s1`, …) because the model is never asked
    /// for one; a device-side generation has to do the same before the screen's
    /// `Identifiable` types can decode it.
    func withId(_ id: String) -> JSONValue {
        guard case .object(var fields) = self, fields["id"] == nil else { return self }
        fields["id"] = .string(id)
        return .object(fields)
    }

    /// Decode a frame's value into the concrete shape the screen renders.
    public func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: try JSONEncoder().encode(self))
    }
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
