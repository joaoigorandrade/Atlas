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
    /// Everything the request needs, decided by the chip that was tapped. Not
    /// optional: a sheet built from a nil context used to spin forever on a
    /// request nobody had made.
    private let request: LensRequest

    init(store: AtlasStore, node: ConceptNode, request: LensRequest) {
        self.store = store
        self.node = node
        self.request = request
    }

    var beats: [ConsumeModelBeat] { store.lens(node, request.chunk, request.lens) }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo…") : message }

    func load() async {
        if let error = await store.model(node, request.chunk, request.lens, context: request.context) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir essa visão"))
        }
    }
}
