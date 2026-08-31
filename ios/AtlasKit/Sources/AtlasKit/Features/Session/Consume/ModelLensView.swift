import SwiftUI

/// The lens sheet. It owns nothing but its own beats — the section it is about
/// was chosen by `ConsumeViewModel` and travels in as a `LensRequest`.
struct ModelLensView: View {
    let request: LensRequest
    let node: ConceptNode
    @Environment(AtlasStore.self) private var store
    @State private var model: ModelLensViewModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(request.lens.label, tint: Palette.accent, size: 11)
                // What the lens promises, on screen before the first beat is:
                // this sheet is opened by someone who is stuck, and a spinner
                // under a bare title tells them nothing.
                Text(request.lens.note)
                    .font(.atlas(.sans, 12.5))
                    .lineSpacing(2)
                    .foregroundStyle(Palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 7)
                if let model {
                    ForEach(Array(model.beats.enumerated()), id: \.offset) { _, beat in
                        Text(verbatim: beat.label).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 20)
                        // A beat is written label-first, so its prose arrives a
                        // moment after its heading — an empty paragraph here is
                        // a redraw in progress, not a beat with nothing in it.
                        if !beat.text.isEmpty {
                            Text(verbatim: beat.text).font(.atlas(.serif, 16.5)).lineSpacing(5).foregroundStyle(Palette.ink).padding(.top, 7)
                        }
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
            let model = model ?? ModelLensViewModel(store: store, node: node, request: request)
            self.model = model
            await model.load()
        }
    }
}
