import Observation
import SwiftUI

/// Screen 20 — confidence against delivery. The samples come from the tap
/// before every review card is flipped; resolving and sorting them walks the
/// whole map, so it happens here and not in `body`.
@Observable
@MainActor
final class CalibrationViewModel {
    private(set) var items: [CalibItem] = []

    private let store: AtlasStore

    init(store: AtlasStore) {
        self.store = store
        refresh()
    }

    var isEmpty: Bool { items.isEmpty }
    /// Only the worst reading is named on the canvas — the rest are rows.
    var worst: CalibItem? {
        guard let first = items.first, first.verdict != .ok else { return nil }
        return first
    }

    func refresh() { items = calibItems(store.calib, store.graph) }

    /// The plain-language read — the point of the surface is teaching the
    /// *feeling*, so the sentence names what the gap actually was.
    func reading(_ item: CalibItem) -> String {
        switch item.verdict {
        case .over:
            "Você se dá \(item.felt)% e entrega \(item.real)%. Isso é fluência, não domínio — vale um novo Crisol aqui."
        case .under:
            "Você se avalia em \(item.felt)% e entrega \(item.real)%. Sabe mais do que acha; pode acelerar aqui."
        case .ok:
            "Confiança e resultado andam juntos aqui — \(item.felt)% contra \(item.real)%."
        }
    }
}
