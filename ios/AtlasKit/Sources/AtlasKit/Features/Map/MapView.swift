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
                // A finished map has no frontier: an amber "0" would read as
                // work left over.
                if store.frontier.count > 0 {
                    Chip(verbatim: "\(store.frontier.count)", dot: NodeState.frontier.color,
                         tint: Palette.amberInk, background: Palette.amberBg)
                        .contentTransition(.numericText())
                        .accessibilityLabel(Text("\(store.frontier.count) conceitos na fronteira"))
                }
            }

            canvasLayer
            sheet
        }
        .background(Palette.paper)
        // A pass ending changes the map underneath this screen: the frontier
        // count moves, the sheet's next node changes, the mastery bar fills.
        .animation(Motion.standard, value: store.frontier.count)
        // The drawer closing takes the highlight with it.
        .onChange(of: navigator.activeSheet) { _, sheet in
            if sheet == nil { model.select(nil) }
        }
        // Screens 14 and 19 are the two a learner reaches from here, and both
        // would otherwise open on a model. The frontier's reading pass is
        // written while they are still looking at the map, and the day's cards
        // are drafted the same way — see `Warm.swift`.
        //
        // The whole frontier, not the two at its head. That cap existed because
        // every warm was a model call from this device; now a hit is a local
        // read from the mirror, then a shared-cache read, and only a genuine
        // miss reaches a model — and the server has usually already written the
        // frontier's reading behind the build. The frontier is the root set of
        // what the learner can start next, which is a handful of nodes, not a
        // list that needs a cap of its own.
        .task(id: store.frontier.map(\.id).joined()) {
            for node in store.frontier { store.warmUp("consume", for: node) }
        }
        // Not keyed on the frontier: the day's deck is drawn from the nodes
        // with no card yet, which has nothing to do with which two are at the
        // head of the queue. Opening a node moves the frontier, and this used
        // to re-fire — against a `uncovered` the first draft had already
        // changed, so the two calls addressed different keys and the cache
        // deduplicated neither. Two decks, two charges, one of them unread.
        .task { store.warmRetain() }
    }

    private func open(_ node: ConceptNode) {
        model.select(node)
        navigator.openSheet(.nodeDetail(node))
    }

    // MARK: - Canvas

    private var canvasLayer: some View {
        GeometryReader { geo in
            // Keep this read inside the GeometryReader: Observation tracks per
            // property, so a pan frame invalidates this closure only. Hoisted
            // two lines up it would put the sheet's percentage animation and
            // the frontier pill on the drag loop.
            let view = model.transform
            let prepared = model.prepared(store.graph)
            GraphCanvas(transform: view, prepared: prepared, shown: store.display,
                        selected: model.selection?.id)
            .contentShape(.rect)
            .gesture(
                // From the first pixel: the default 10pt minimum arrives as a
                // 10pt jump on the first frame. A tap produces no drag update,
                // so `onTapGesture` still wins short touches.
                //
                // Pan only, on purpose: one finger cannot mean both "move the
                // map" and "move this node", and on a phone-sized viewport
                // panning is the one worth having. Rearranging a map is a desk
                // job — the browser owns the drag, and the positions it writes
                // are folded onto the nodes on load (`AtlasRun.init`), so
                // this screen draws whatever layout the learner arranged there.
                DragGesture(minimumDistance: 0)
                    .onChanged { model.pan($0.translation) }
                    .onEnded { _ in model.endPan() }
                    .simultaneously(with: MagnifyGesture()
                        .onChanged { model.magnify($0.magnification, around: $0.startLocation) }
                        .onEnded { _ in model.endZoom() })
            )
            // Simultaneous, not a separate `.onTapGesture`: the pan above
            // recognises from the first pixel, so a tap gesture added beside it
            // never gets the touch. A spatial tap fails the moment the finger
            // travels, so panning still wins a real drag.
            .simultaneousGesture(SpatialTapGesture().onEnded { tap in
                if let node = model.node(store.graph, at: tap.location) { open(node) }
            })
            // Only on opening a node: closing the drawer clears the selection,
            // and a buzz on dismiss reads as a second, phantom tap.
            .sensoryFeedback(.selection, trigger: model.selection?.id) { _, new in new != nil }
            .onAppear { model.fit(store.graph, in: geo.size) }
            .onChange(of: geo.size) { _, size in model.resize(store.graph, in: size) }
            // Another map opened underneath this screen — "Seus mapas" switches
            // the run without leaving the tab, and the old fit points at
            // coordinates the new graph has no nodes near.
            .onChange(of: store.subject) { _, _ in model.fit(store.graph, in: geo.size) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(alignment: .bottomTrailing) { controls.padding(16) }
    }

    /// The two things a learner can ask of the view itself: put it back, and
    /// take me to the next node.
    private var controls: some View {
        VStack(alignment: .trailing, spacing: 10) {
            if model.moved {
                Button { model.reframe(store.graph) } label: {
                    Image(systemName: "arrow.down.left.and.arrow.up.right")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Palette.ink)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                        .background(Palette.card, in: .circle)
                        .overlay { Circle().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                        .shadow(color: Palette.ink.opacity(0.10), radius: 10, y: 6)
                }
                .pressable()
                .accessibilityLabel(Text("Enquadrar o mapa"))
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
            frontierButton
        }
        .animation(Motion.standard, value: model.moved)
    }

    @ViewBuilder
    private var frontierButton: some View {
        if let target = store.frontier.first {
            Button {
                model.jump(to: target)
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
            .pressable()
            // It appears the moment a frontier exists and goes when the map is
            // finished — both are worth a beat.
            .transition(.scale(scale: 0.8).combined(with: .opacity))
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
                        .contentTransition(.numericText())
                }
                ProgressView(value: store.mastered).tint(Palette.accent)
            }
            // The label, the figure and the bar are one reading, not three —
            // the bar alone has no name at all.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Território dominado"))
            .accessibilityValue(Text(verbatim: store.mastered.formatted(.percent.precision(.fractionLength(0)))))

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
                    .pressable()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(Motion.reward, value: store.mastered)
        .padding(.horizontal, Metrics.gutter)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(Palette.cardAlt)
        .clipShape(.rect(topLeadingRadius: 18, topTrailingRadius: 18))
        .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
    }
}
