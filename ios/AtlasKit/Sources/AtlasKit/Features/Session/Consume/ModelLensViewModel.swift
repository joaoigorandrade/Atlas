import Observation
import SwiftUI

/// One lens over the section on screen — the same material, walked through a
/// beat at a time. The prose behind it is never swapped.
///
/// The beats live in the run's warm cache rather than here, keyed on the
/// section and the lens: reopening a walkthrough is a read, not a second
/// generation, and it is in `run_states.caches` for the next launch and for the
/// browser. See `Warm.swift`.
@Observable
@MainActor
final class ModelLensViewModel {
    private(set) var message = ""

    private let store: AtlasStore
    private let node: ConceptNode
    private let chunk: ConsumeChunk?
    private let lens: AltKey
    private let context: [String: JSONValue]?

    init(store: AtlasStore, node: ConceptNode, chunk: ConsumeChunk?, lens: AltKey,
         context: [String: JSONValue]?) {
        self.store = store
        self.node = node
        self.chunk = chunk
        self.lens = lens
        self.context = context
    }

    var beats: [ConsumeModelBeat] {
        guard let chunk else { return [] }
        return store.lens(node, chunk, lens)
    }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo…") : message }

    func load() async {
        guard let chunk, let context else { return }
        if let error = await store.model(node, chunk, lens, context: context) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir essa visão"))
        }
    }
}
