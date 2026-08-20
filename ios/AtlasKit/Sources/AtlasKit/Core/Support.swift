import Foundation

/// The two one-liners the whole app leans on, and the sentence every screen
/// says when a generation fails. Nothing here belongs to a feature.

public extension Array {
    /// The item after the last one that has arrived is a real item on its way,
    /// not a crash — every streamed surface indexes past its own end.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

public extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

/// Something true about the failure, in the learner's language. The upstream
/// `message` is for logs and never reaches the screen (ios/AGENTS.md).
public enum ErrorCopy {
    public static func sentence(for error: Error, doing what: String) -> String {
        switch (error as? AtlasError)?.code {
        case "auth": "Sua sessão expirou — entre de novo para \(what)."
        case "rate_limit": "Você pediu bastante coisa em pouco tempo. Espere um instante e tente de novo."
        case "request": "Não conseguimos \(what) com esse pedido. Tente descrever o tema de outro jeito."
        default: "Não conseguimos \(what) agora. Tente de novo em instantes."
        }
    }
}
