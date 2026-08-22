import Observation
import SwiftUI

/// One lens over the section on screen — the same material, walked through a
/// beat at a time. The prose behind it is never swapped.
@Observable
@MainActor
final class ModelLensViewModel {
    private(set) var message = ""

    private let store: AtlasStore
    private let node: ConceptNode
    private let chunk: ConsumeChunk
    private let lens: AltKey

    init(store: AtlasStore, node: ConceptNode, chunk: ConsumeChunk, lens: AltKey) {
        self.store = store
        self.node = node
        self.chunk = chunk
        self.lens = lens
    }

    /// The beats live in the run's warm cache, not here — which is what makes
    /// reopening a lens a read rather than a second pass, and what lets a view
    /// still being written land in the sheet as it arrives.
    var beats: [ConsumeModelBeat] { store.modelBeats(node, chunk, lens) }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo…") : message }

    func load() async {
        if let error = await store.model(node, chunk, lens) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir essa visão"))
        }
    }
}
