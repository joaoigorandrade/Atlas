import Navigation
import SwiftUI

/// "Mapa" — the canvas, the frontier jump, and the persistent sheet that says
/// where the run stands. Selecting a node opens the node drawer through the
/// navigator; starting a pass is pushed from there.
public struct MapView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model = MapViewModel()

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            TopBar {
                Text(verbatim: "Atlas").font(.atlas(.serif, 19, weight: .semibold)).foregroundStyle(Palette.ink)
            } trailing: {
                Chip(verbatim: "\(store.frontier.count)", dot: NodeState.frontier.color,
                     tint: Palette.amberInk, background: Palette.amberBg)
            }

            canvasLayer
            sheet
        }
        .background(Palette.paper)
        // The drawer closing takes the highlight with it.
        .onChange(of: navigator.activeSheet) { _, sheet in
            if sheet == nil { model.select(nil) }
        }
    }

    private func open(_ node: ConceptNode) {
        model.select(node)
        navigator.openSheet(.nodeDetail(node))
    }

    // MARK: - Canvas

    private var canvasLayer: some View {
        GeometryReader { geo in
            let view = model.live
            Canvas { context, _ in
                drawGraph(&context, store.graph, store.display, view, selected: model.selection?.id)
            }
            .contentShape(.rect)
            .gesture(
                DragGesture()
                    .onChanged { model.pan = $0.translation }
                    .onEnded { _ in model.settle() }
                    .simultaneously(with: MagnifyGesture()
                        .onChanged { model.zoom = $0.magnification }
                        .onEnded { _ in model.settle() })
            )
            .onTapGesture { point in
                if let node = model.node(store.graph, at: point) { open(node) }
            }
            .onAppear { model.fit(store.graph, in: geo.size) }
            .onChange(of: geo.size) { _, size in model.resize(size) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(alignment: .bottomTrailing) { frontierButton.padding(16) }
    }

    @ViewBuilder
    private var frontierButton: some View {
        if let target = store.frontier.first {
            Button { model.jump(to: target) } label: {
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
            VStack(alignment: .leading, spacing: 5) {
                Kicker("Assunto")
                Text(verbatim: store.subject).font(.atlas(.serif, 21)).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Território dominado").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                    Spacer()
                    Text(verbatim: store.mastered.formatted(.percent.precision(.fractionLength(0))))
                        .font(.atlas(.serif, 21)).foregroundStyle(Palette.accent)
                }
                ProgressView(value: store.mastered).tint(Palette.accent)
            }

            if let next = store.frontier.first {
                VStack(alignment: .leading, spacing: 7) {
                    Kicker("Próximo")
                    Button { open(next) } label: {
                        HStack(spacing: 10) {
                            Circle().fill(NodeState.frontier.color).frame(width: 8, height: 8)
                            Text(verbatim: next.label).font(.atlas(.serif, 14.5)).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer(minLength: 0)
                            Text(verbatim: "+\(store.frontier.count)").font(.atlas(.mono, 10)).foregroundStyle(Palette.inkFaint)
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
