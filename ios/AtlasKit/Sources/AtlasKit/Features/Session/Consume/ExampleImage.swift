import SwiftUI

/// The picture for a worked example or a Perform case — the web's
/// `ExampleImage`. Every draw is billed, so nothing is fetched until the
/// learner taps; the server keeps each learner's draws, so a second tap is
/// free. Any failure draws nothing: the text above and below stands on its own.
///
/// ponytail: the one view here that keeps its own `@State` — a button that
/// becomes a picture, shared by two screens, with nothing a phase model reads.
struct ExampleImage: View {
    /// The whole prompt — the web builds the same string, so a figure drawn on
    /// one client is the cached one on the other.
    private let prompt: String
    private let alt: String
    @Environment(AtlasStore.self) private var store
    @State private var phase = Phase.idle

    private enum Phase: Equatable { case idle, loading, failed, drawn(URL) }

    /// A worked example: its title, every step, and the pass's `visual` hint.
    init(example: ConsumeExample) {
        prompt = ([ "Draw the figure for this worked example: \(example.title)" ]
            + example.steps.enumerated().map { "\($0.offset + 1). \($0.element)" }
            + [example.visual.map { "Figure: \($0)" }].compactMap { $0 })
            .joined(separator: "\n")
        alt = example.title
    }

    /// Perform's case: its given values only, never a step of the solution.
    init(task: String) {
        prompt = "Draw the figure for this problem with its given values only — never any step or result of the solution: \(task)"
        alt = task
    }

    var body: some View {
        switch phase {
        case .idle:
            Button {
                phase = .loading
                Task {
                    let url = try? await store.api.exampleImage(prompt)
                    phase = url.map(Phase.drawn) ?? .failed
                }
            } label: {
                Text("Ver figura")
                    .font(.atlas(.caps, 12))
                    .tracking(1)
                    .foregroundStyle(NodeState.learning.color)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .overlay {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(NodeState.learning.color, lineWidth: 1)
                    }
                    .frame(minHeight: Metrics.tap)
            }
            .pressable()
        case .loading:
            frame {
                VStack(spacing: 10) {
                    ChartingMark(compact: true)
                    Text("Desenhando a figura…")
                        .font(.atlas(.serif, 13))
                        .foregroundStyle(Palette.inkGhost)
                }
            }
        case .drawn(let url):
            frame {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    ChartingMark(compact: true)
                }
                .accessibilityLabel(Text(verbatim: alt))
            }
        case .failed:
            EmptyView()
        }
    }

    /// A white 4:3 plate, the web's frame — figures are drawn on white.
    private func frame<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        // The plate sets the size; whatever is drawn sits inside it.
        Color.white
            .aspectRatio(4 / 3, contentMode: .fit)
            .overlay { content() }
            .clipShape(.rect(cornerRadius: 3))
            .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.hairline, lineWidth: 1) }
    }
}
