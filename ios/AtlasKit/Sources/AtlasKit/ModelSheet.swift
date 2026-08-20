import SwiftUI

/// A lens over the section on screen — the same material, walked through one
/// beat at a time. The prose behind it is never swapped.
struct ModelSheet: View {
    let session: Session
    let chunk: ConsumeChunk?
    let lens: AltKey
    @Environment(AtlasStore.self) private var store
    @State private var beats: [ConsumeModelBeat] = []
    @State private var message = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(lens.label, tint: Palette.accent, size: 11)
                ForEach(Array(beats.enumerated()), id: \.offset) { _, beat in
                    Text(beat.label).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 20)
                    Text(beat.text).font(.atlas(.serif, 16.5)).lineSpacing(5).foregroundStyle(Palette.ink).padding(.top, 7)
                }
                if beats.isEmpty { Waiting(message.isEmpty ? "Escrevendo…" : message, spinning: message.isEmpty).padding(.top, 40) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.vertical, 22)
        }
        .background(Palette.cardAlt)
        .task {
            guard let chunk else { return }
            var context = session.context
            context["lens"] = .string(lens.rawValue)
            context["kicker"] = .string(chunk.kicker)
            context["sectionBody"] = .array(chunk.body.map { .string($0) })
            context["takeaway"] = .string(chunk.takeaway)
            do {
                for try await landed in await store.api.model(context) { beats = landed }
            } catch {
                message = Onboarding.copy(for: error, doing: "abrir essa visão")
            }
        }
    }
}
