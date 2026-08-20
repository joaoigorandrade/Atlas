import SwiftUI

/// Pan and zoom, in one place so the drawing and the tap hit-test can never
/// disagree about where a node is.
struct MapTransform: Equatable {
    var offset: CGSize = .zero
    var scale: CGFloat = 1

    func place(_ node: ConceptNode) -> CGPoint {
        CGPoint(x: node.x * scale + offset.width, y: node.y * scale + offset.height)
    }

    /// The whole map, centred in `size` with room for the labels under a node.
    static func fitting(_ graph: ConceptGraph, in size: CGSize, inset: CGFloat = 46) -> MapTransform {
        let xs = graph.nodes.map(\.x), ys = graph.nodes.map(\.y)
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max(),
              size.width > inset * 2, size.height > inset * 2 else { return .init() }
        let scale = min(
            (size.width - inset * 2) / max(maxX - minX, 1),
            (size.height - inset * 2) / max(maxY - minY, 1),
            1.6
        )
        return MapTransform(
            offset: CGSize(
                width: (size.width - (maxX - minX) * scale) / 2 - minX * scale,
                height: (size.height - (maxY - minY) * scale) / 2 - minY * scale
            ),
            scale: scale
        )
    }

    /// Puts one node in the middle of the viewport, keeping the current zoom.
    func centred(on node: ConceptNode, in size: CGSize) -> MapTransform {
        MapTransform(
            offset: CGSize(width: size.width / 2 - node.x * scale, height: size.height / 2 - node.y * scale),
            scale: scale
        )
    }
}

/// The nearest node under a tap, or nil for empty canvas. The reach is a tap
/// target, not the drawn radius — the design's 13pt circles are far under 44pt.
func nodeHit(_ graph: ConceptGraph, _ transform: MapTransform, at point: CGPoint,
             reach: CGFloat = Metrics.tap / 2) -> ConceptNode? {
    graph.nodes
        .map { ($0, hypot(transform.place($0).x - point.x, transform.place($0).y - point.y)) }
        .filter { $0.1 <= reach }
        .min { $0.1 < $1.1 }?.0
}

/// "Mapa" — the canvas, the frontier jump, and the persistent sheet that says
/// where the run stands. Selecting a node presents `NodeDetailView`.
public struct MapView: View {
    @Environment(AtlasStore.self) private var store
    @State private var transform = MapTransform()
    @State private var pan: CGSize = .zero
    @State private var zoom: CGFloat = 1
    @State private var selection: ConceptNode?
    /// The pass the node sheet asked for, held until the sheet is actually
    /// gone — presenting a full-screen session over a dismissing sheet is how
    /// you get neither.
    @State private var starting: ConceptNode?
    @State private var session: Session?
    /// The viewport, kept so the frontier button and the initial fit can do
    /// their arithmetic outside the layout pass.
    @State private var canvas: CGSize = .zero

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            TopBar {
                Text("Atlas").font(.atlas(.serif, 19, weight: .semibold)).foregroundStyle(Palette.ink)
            } trailing: {
                Chip("\(store.frontier.count)", dot: NodeState.frontier.color,
                     tint: Palette.amberInk, background: Palette.amberBg)
            }

            canvasLayer
            sheet
        }
        .background(Palette.paper)
        .sheet(item: $selection, onDismiss: open) { node in
            NodeDetailView(node: node) { starting = $0 }
                .presentationDetents([.fraction(0.72), .large])
                .presentationDragIndicator(.visible)
                .environment(store)
        }
        // The session takes the whole screen, tab bar included: it has its own
        // top bar and its own way back. (`macOS` is in the package only so
        // `swift test` runs on the host, where the cover doesn't exist.)
        #if os(iOS)
        .fullScreenCover(item: $session) { session in
            SessionView(session: session).environment(store)
        }
        #else
        .sheet(item: $session) { session in
            SessionView(session: session).environment(store)
        }
        #endif
    }

    /// The spiral is pushed from the map, never entered from a tab — a session
    /// is not a destination without a node.
    private func open() {
        guard let node = starting else { return }
        starting = nil
        session = Session(node: node, store: store)
    }

    // MARK: - Canvas

    private var live: MapTransform {
        MapTransform(
            offset: CGSize(width: transform.offset.width + pan.width, height: transform.offset.height + pan.height),
            scale: transform.scale * zoom
        )
    }

    private var canvasLayer: some View {
        GeometryReader { geo in
            let view = live
            Canvas { context, _ in
                    drawGraph(&context, store.graph, store.display, view, selected: selection?.id)
                }
                .contentShape(.rect)
                .gesture(
                    DragGesture()
                        .onChanged { pan = $0.translation }
                        .onEnded { _ in transform = live; pan = .zero }
                        .simultaneously(with: MagnifyGesture()
                            .onChanged { zoom = $0.magnification }
                            .onEnded { _ in transform = live; zoom = 1 })
                )
                .onTapGesture { point in
                    selection = nodeHit(store.graph, view, at: point)
                }
                .onAppear {
                    canvas = geo.size
                    transform = .fitting(store.graph, in: geo.size)
                }
                .onChange(of: geo.size) { _, size in canvas = size }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(alignment: .bottomTrailing) { frontierButton.padding(16) }
    }

    @ViewBuilder
    private var frontierButton: some View {
        if let target = store.frontier.first {
            Button {
                withAnimation(Motion.enter) { transform = live.centred(on: target, in: canvas) }
                pan = .zero; zoom = 1
            } label: {
                HStack(spacing: 8) {
                    Circle().fill(NodeState.frontier.color).frame(width: 8, height: 8)
                        .shadow(color: NodeState.frontier.color, radius: 3)
                    Text("Ir para a fronteira").font(.atlas(.sans, 13.5)).foregroundStyle(Palette.ink)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: Metrics.tap)
                .background(Palette.card, in: .capsule)
                .overlay { Capsule().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                .shadow(color: Palette.ink.opacity(0.10), radius: 10, y: 6)
            }
        }
    }

    // MARK: - The persistent sheet

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Kicker("Assunto")
                    Text(store.subject).font(.atlas(.serif, 21)).foregroundStyle(Palette.ink)
                }
                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Território dominado").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                    Spacer()
                    Text(store.mastered.formatted(.percent.precision(.fractionLength(0))))
                        .font(.atlas(.serif, 21)).foregroundStyle(Palette.accent)
                }
                ProgressView(value: store.mastered).tint(Palette.accent)
            }

            if let next = store.frontier.first {
                VStack(alignment: .leading, spacing: 7) {
                    Kicker("Próximo")
                    Button { selection = next } label: {
                        HStack(spacing: 10) {
                            Circle().fill(NodeState.frontier.color).frame(width: 8, height: 8)
                            Text(next.label).font(.atlas(.serif, 14.5)).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer(minLength: 0)
                            Text("+\(store.frontier.count)").font(.atlas(.mono, 10)).foregroundStyle(Palette.inkFaint)
                        }
                        .padding(.horizontal, 13)
                        .frame(minHeight: 48)
                        .background(Palette.card, in: .rect(cornerRadius: 11))
                        .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }
                }
            }
        }
        .padding(.horizontal, Metrics.gutter)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(Palette.cardAlt)
        .clipShape(.rect(topLeadingRadius: 18, topTrailingRadius: 18))
        .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
    }
}

/// The map itself, drawn. A free function because onboarding paints the same
/// territory behind screens 6 and 7 — the map assembling is the same map.
///
/// `labels` is off there: a map nobody can tap yet is a picture, and labelling
/// every node turns it into a wall of type. On the real canvas only the nodes
/// that carry a decision are labelled; the rest answer to a tap.
func drawGraph(
    _ context: inout GraphicsContext,
    _ graph: ConceptGraph,
    _ shown: [String: NodeState],
    _ view: MapTransform,
    selected: String? = nil,
    labels: Bool = true
) {
    for edge in graph.edges {
        guard let a = graph.nodes.first(where: { $0.id == edge.from }),
              let b = graph.nodes.first(where: { $0.id == edge.to }) else { continue }
        var path = Path()
        path.move(to: view.place(a))
        path.addLine(to: view.place(b))
        context.stroke(
            path,
            with: .color(Palette.ink.opacity(edge.dashed ? 0.10 : 0.16)),
            style: StrokeStyle(lineWidth: 1.2, dash: edge.dashed ? [4, 5] : [])
        )
    }
    for node in graph.nodes {
        let state = shown[node.id] ?? .unknown
        let point = view.place(node)
        let radius: CGFloat = state == .frontier || node.id == selected ? 15 : (node.gap == true ? 11 : 13)
        // The frontier's two haloes are the design's only glow — they are what
        // makes "where do I go next" readable at a glance.
        if state == .frontier {
            for (r, alpha) in [(radius * 2, 0.12), (radius * 1.4, 0.22)] {
                context.fill(Path(ellipseIn: CGRect(x: point.x - r, y: point.y - r, width: r * 2, height: r * 2)),
                             with: .color(state.color.opacity(alpha)))
            }
        }
        context.fill(
            Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)),
            with: .color(state.color)
        )
        guard labels, state == .frontier || state == .shaky || node.id == selected else { continue }
        context.draw(
            Text(node.label).font(.atlas(.serif, state == .frontier ? 14 : 12.5))
                .foregroundStyle(state == .frontier ? Palette.ink : Palette.inkMuted),
            at: CGPoint(x: point.x, y: point.y + radius + 16)
        )
    }
}
