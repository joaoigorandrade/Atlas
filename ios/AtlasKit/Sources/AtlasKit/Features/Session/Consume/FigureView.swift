import SwiftUI

/// A section's schematic figure: layered boxes, wired downwards. The layers are
/// computed once in `init` — `figureLayers` walks every edge, which is not work
/// for `body` — so a model-authored cycle draws flat instead of hanging.
struct FigureView: View {
    private let rows: [[ConsumeFigure.Node]]

    init(_ figure: ConsumeFigure) {
        let layers = figureLayers(figure)
        rows = Dictionary(grouping: figure.nodes) { layers[$0.id] ?? 0 }
            .sorted { $0.key < $1.key }
            .map(\.value)
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { row, layer in
                if row > 0 {
                    Image(systemName: "arrow.down")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.inkGhost)
                        .padding(.vertical, 7)
                }
                HStack(spacing: 8) {
                    ForEach(layer) { node in
                        Text(node.label)
                            .font(.atlas(.sans, 12.5))
                            .foregroundStyle(Palette.inkSoft)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 11).padding(.vertical, 9)
                            .background(Palette.cardAlt, in: .rect(cornerRadius: 8))
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairline, lineWidth: 1) }
    }
}
