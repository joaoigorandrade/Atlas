import SwiftUI

/// Where each box ended up, so the arrows can be drawn between the two boxes
/// they actually connect rather than between rows.
private struct FigureBoxes: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] { [:] }
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { _, next in next }
    }
}

/// A section's schematic figure: layered boxes wired by the model's own edges.
/// The layers are computed once in `init` — `figureLayers` walks every edge,
/// which is not work for `body` — so a model-authored cycle draws flat instead
/// of hanging.
struct FigureView: View {
    private let rows: [[ConsumeFigure.Node]]
    private let edges: [ConsumeFigure.Edge]
    private let caption: String?

    init(_ figure: ConsumeFigure, caption: String? = nil) {
        // `validateFigure` on the server rejects duplicate ids, so this is a
        // second line rather than the only one — a row cached before that
        // validator, or one the phone decoded loosely, would still give
        // `ForEach` a duplicate identity and drop or mis-diff a row. The first
        // box of an id wins, and an edge pointing at a box that isn't there (or
        // at itself) is dropped with it.
        var seen = Set<String>()
        let nodes = figure.nodes.filter { seen.insert($0.id).inserted }
        let drawn = figure.edges.filter { seen.contains($0.from) && seen.contains($0.to) && $0.from != $0.to }
        let layers = figureLayers(ConsumeFigure(nodes: nodes, edges: drawn))
        rows = Dictionary(grouping: nodes) { layers[$0.id] ?? 0 }
            .sorted { $0.key < $1.key }
            .map(\.value)
        edges = drawn
        self.caption = caption
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 30) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, layer in
                    HStack(spacing: 10) {
                        ForEach(layer) { node in box(node) }
                    }
                }
            }
            .frame(maxWidth: .infinity)
            // Every edge the model wrote, and only those. Drawing one arrow per
            // row gap instead asserted relationships nobody wrote: two
            // independent chains read as a diamond, and a cross edge inside a
            // row was invisible.
            .overlayPreferenceValue(FigureBoxes.self) { boxes in
                GeometryReader { space in
                    Canvas { context, _ in
                        // What is already taken. The boxes count: an edge that
                        // spans two rows passes *through* the row between them,
                        // so its midpoint sits inside a box — "Gases liberados"
                        // was printed across "Gases quentes". Labels count too:
                        // two edges out of the same box land their midpoints
                        // side by side, and the second card drew over the first.
                        var placed: [CGRect] = boxes.values.map { space[$0] }
                        for edge in edges {
                            guard let from = boxes[edge.from], let to = boxes[edge.to] else { continue }
                            wire(&context, space[from], space[to], edge.label, &placed)
                        }
                    }
                }
                .allowsHitTesting(false)
            }

            if let caption, !caption.isEmpty {
                Text(verbatim: caption)
                    .font(.atlas(.mono, 10.5))
                    .foregroundStyle(Palette.inkFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 12)
            }
        }
        .padding(14)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairline, lineWidth: 1) }
        // Without this the figure is a loose pile of words to VoiceOver. The
        // model's own caption is the description it wrote for the drawing.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Diagrama"))
        .accessibilityValue(Text(verbatim: caption ?? rows.flatMap { $0 }.map(\.label).joined(separator: ", ")))
    }

    private func box(_ node: ConsumeFigure.Node) -> some View {
        Text(verbatim: node.label)
            .font(.atlas(.sans, 12.5))
            .foregroundStyle(Palette.inkSoft)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 11).padding(.vertical, 9)
            .background(Palette.cardAlt, in: .rect(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
            .anchorPreference(key: FigureBoxes.self, value: .bounds) { [node.id: $0] }
    }

    /// The card drawn behind a label, centred on `at`.
    private func box(_ size: CGSize, _ at: CGPoint) -> CGRect {
        CGRect(x: at.x - size.width / 2 - 3, y: at.y - size.height / 2 - 1,
               width: size.width + 6, height: size.height + 2)
    }

    /// One arrow between two boxes, from the edge of the first towards the
    /// edge of the second, with the model's label on it when it wrote one.
    private func wire(
        _ context: inout GraphicsContext, _ from: CGRect, _ to: CGRect, _ label: String?,
        _ placed: inout [CGRect]
    ) {
        let start = CGPoint(x: from.midX, y: from.midY < to.midY ? from.maxY : from.minY)
        let end = CGPoint(x: to.midX, y: from.midY < to.midY ? to.minY - 3 : to.maxY + 3)
        var line = Path()
        line.move(to: start)
        line.addLine(to: end)
        context.stroke(line, with: .color(Palette.inkGhost), lineWidth: 1)

        let angle = atan2(end.y - start.y, end.x - start.x)
        var head = Path()
        for turn in [2.6, -2.6] as [CGFloat] {
            head.move(to: end)
            head.addLine(to: CGPoint(x: end.x + cos(angle + turn) * 6, y: end.y + sin(angle + turn) * 6))
        }
        context.stroke(head, with: .color(Palette.inkGhost), lineWidth: 1)

        guard let label, !label.isEmpty else { return }
        // On its own card, not bare on the line. An edge that spans two rows
        // has its midpoint *inside* the row between them, so the label landed
        // across a box — "Coordenação" was printed over with "não aproveita" —
        // and two labels from the same row overlapped each other.
        let text = context.resolve(
            Text(verbatim: label).font(.atlas(.mono, 9)).foregroundStyle(Palette.inkFaint)
        )
        let size = text.measure(in: CGSize(width: 140, height: 40))
        var at = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
        var card = box(size, at)
        if placed.contains(where: { $0.intersects(card) }) {
            // Step out of the way, sideways before lengthways: an edge crossing
            // a row has a whole row-gap of paper beside the box it passes over,
            // while sliding along the edge stays in that same column.
            let len = max(hypot(end.x - start.x, end.y - start.y), 1)
            let ax = (end.x - start.x) / len, ay = (end.y - start.y) / len
            let across = size.width / 2 + 12, along = size.height + 6
            let offsets = (1...3).flatMap { i -> [CGPoint] in
                let n = CGFloat(i)
                return [CGPoint(x: -ay * across * n, y: ax * across * n),
                        CGPoint(x: ay * across * n, y: -ax * across * n),
                        CGPoint(x: ax * along * n, y: ay * along * n),
                        CGPoint(x: -ax * along * n, y: -ay * along * n)]
            }
            var free: CGRect?
            for offset in offsets {
                let point = CGPoint(x: at.x + offset.x, y: at.y + offset.y)
                let rect = box(size, point)
                if !placed.contains(where: { $0.intersects(rect) }) {
                    free = rect
                    at = point
                    break
                }
            }
            // Nowhere to put it: drop the label rather than print it over a box.
            // The arrow still says there is an edge, which is more than two
            // unreadable words stacked on each other said. Same rule the map
            // uses for its node labels (`drawGraph`).
            guard let free else { return }
            card = free
        }
        placed.append(card)
        context.fill(Path(roundedRect: card, cornerRadius: 3), with: .color(Palette.card))
        context.draw(text, at: at)
    }
}
