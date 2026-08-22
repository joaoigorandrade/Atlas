import SwiftUI

/// The lens sheet. It owns nothing at all — the section it is about was chosen
/// by `ConsumeViewModel`, and the beats belong to the run's warm cache.
struct ModelLensView: View {
    let node: ConceptNode
    let open: OpenLens
    @Environment(AtlasStore.self) private var store
    @State private var model: ModelLensViewModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(open.lens.label, tint: Palette.accent, size: 11)
                if let model {
                    ForEach(Array(model.beats.enumerated()), id: \.offset) { _, beat in
                        Text(verbatim: beat.label).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 20)
                        Text(verbatim: beat.text).font(.atlas(.serif, 16.5)).lineSpacing(5).foregroundStyle(Palette.ink).padding(.top, 7)
                    }
                    if model.beats.isEmpty {
                        Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty).padding(.top, 40)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.vertical, 22)
        }
        .background(Palette.cardAlt)
        .task {
            let model = model ?? ModelLensViewModel(
                store: store, node: node, chunk: open.chunk, lens: open.lens
            )
            self.model = model
            await model.load()
        }
    }
}
