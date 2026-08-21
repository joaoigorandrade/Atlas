import Observation
import SwiftUI

/// One lens over the section on screen — the same material, walked through a
/// beat at a time. The prose behind it is never swapped.
@Observable
@MainActor
final class ModelLensViewModel {
    private(set) var beats: [ConsumeModelBeat] = []
    private(set) var message = ""

    private let api: AtlasAPI
    private let context: [String: JSONValue]?

    init(api: AtlasAPI, context: [String: JSONValue]?) {
        self.api = api
        self.context = context
    }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo…") : message }

    func load() async {
        guard let context else { return }
        do {
            for try await landed in await api.model(context) { beats = landed }
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir essa visão"))
        }
    }
}
