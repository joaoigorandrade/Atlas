import SwiftUI

/// The lens sheet. It owns nothing but its own beats — the section it is about
/// was chosen by `ConsumeViewModel` and travels in as a context.
struct ModelLensView: View {
    let lens: AltKey
    let context: [String: JSONValue]?
    @Environment(AtlasStore.self) private var store
    @State private var model: ModelLensViewModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(lens.label, tint: Palette.accent, size: 11)
                if let model {
                    ForEach(Array(model.beats.enumerated()), id: \.offset) { _, beat in
                        Text(beat.label).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 20)
                        Text(beat.text).font(.atlas(.serif, 16.5)).lineSpacing(5).foregroundStyle(Palette.ink).padding(.top, 7)
                    }
                    if model.beats.isEmpty {
                        Waiting(model.waitingCopy, spinning: model.message.isEmpty).padding(.top, 40)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.vertical, 22)
        }
        .background(Palette.cardAlt)
        .task {
            let model = model ?? ModelLensViewModel(api: store.api, context: context)
            self.model = model
            await model.load()
        }
    }
}
