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
    /// `what` is copy too: the caller hands in an already-localised fragment,
    /// so each sentence is one catalogue entry with one `%@` in it rather than
    /// two languages spliced together.
    public static func sentence(for error: Error, doing what: String) -> String {
        switch (error as? AtlasError)?.code {
        case "auth": String(localized: "Sua sessão expirou — entre de novo para \(what).")
        // `transport` has classified this since the client was written, and
        // nothing ever read it: an offline learner was told to try again in a
        // moment, about a request that cannot succeed until they reconnect.
        case "offline": String(localized: "Você está sem internet — não conseguimos \(what) agora.")
        // The two quotas answer 429 as well, and telling someone whose daily
        // budget is spent to "wait an instant" is an invitation to tap the same
        // button all evening. What is already written stays readable either way.
        case "rate_limit" where (error as? AtlasError)?.reason == "daily_quota":
            String(localized: "Por hoje as gerações acabaram — voltam amanhã. Tudo o que já foi escrito continua aqui.")
        case "rate_limit" where (error as? AtlasError)?.reason == "monthly_ceiling":
            String(localized: "As gerações estão pausadas por enquanto. Tudo o que já foi escrito continua aqui.")
        case "rate_limit": String(localized: "Você pediu bastante coisa em pouco tempo. Espere um instante e tente de novo.")
        case "request": String(localized: "Não conseguimos \(what) com esse pedido. Tente descrever o tema de outro jeito.")
        default: String(localized: "Não conseguimos \(what) agora. Tente de novo em instantes.")
        }
    }
}
