import Navigation
import SwiftUI

/// "Mapa" — the trail, and the persistent sheet that says where the run stands.
/// The map read as one walk down the screen, foundations at the top and the
/// frontier somewhere below, rather than a graph the learner has to pan around
/// to find themselves on. Selecting a step opens the node drawer through the
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

            trail
            sheet
        }
        .background(Palette.paper)
        // A pass ending changes the trail underneath this screen: the frontier
        // count moves, a step's disc fills, the sheet's next node changes.
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

    // MARK: - The trail

    private var trail: some View {
        // One read of the width: the layout is built against it, and a
        // GeometryReader per level would re-measure the same number for each.
        GeometryReader { geo in
            let map = model.trail(store.graph, width: geo.size.width)
            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    ZStack(alignment: .topLeading) {
                        // Every edge in one canvas, over the whole map: an edge
                        // reaching back three levels has to be drawn across the
                        // bands it crosses, and a canvas per band would clip it.
                        Canvas { context, _ in draw(map, into: &context) }
                            .frame(width: map.size.width, height: map.size.height)
                        // The bands are real views, in order, so the frontier
                        // can be scrolled to — a concept placed with `.position`
                        // has the band's frame, not its own.
                        VStack(spacing: 0) {
                            ForEach(Array(map.levels.enumerated()), id: \.offset) { level, row in
                                ZStack {
                                    ForEach(row) { placed in
                                        NodeMark(
                                            node: placed.node,
                                            state: store.display[placed.id] ?? .unknown,
                                            selected: model.selection?.id == placed.id
                                        ) { open(placed.node) }
                                        .frame(width: TrailMap.slot - 12)
                                        .position(x: placed.at.x, y: TrailMap.band / 2)
                                    }
                                }
                                .frame(width: map.size.width, height: TrailMap.band)
                                .id(level)
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                // Landing on the frontier is the whole point: the level the
                // learner is working on, not the foundations they finished
                // weeks ago. No animation — this is where the screen opens.
                .onAppear { show(map, proxy) }
                // Another map opened underneath this screen: "Seus mapas"
                // switches the run without leaving the tab, and the scroll is
                // still parked on a level the new map may not have.
                .onChange(of: store.subject) { _, _ in show(map, proxy) }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func show(_ map: TrailMap, _ proxy: ScrollViewProxy) {
        guard let target = store.frontier.first,
              let placed = map.placed.first(where: { $0.id == target.id }) else { return }
        // The band is the full width of the map, so the anchor has to carry the
        // horizontal position too: on a level wide enough to scroll, `.center`
        // would centre the whole level and leave the frontier off to one side.
        proxy.scrollTo(placed.level, anchor: UnitPoint(x: placed.at.x / map.size.width, y: 0.5))
    }

    /// The edges, drawn top to bottom. Direction is the layout's job — a
    /// prerequisite is always above what it unlocks — so there are no
    /// arrowheads to keep the map quiet at a glance.
    private func draw(_ map: TrailMap, into context: inout GraphicsContext) {
        for link in map.links {
            // Off the bottom of one disc and into the top of the next, so an
            // edge never crosses the disc it starts from.
            let from = CGPoint(x: link.from.x, y: link.from.y + 17)
            let to = CGPoint(x: link.to.x, y: link.to.y - 19)
            let reach = (to.y - from.y) * 0.45
            var path = Path()
            path.move(to: from)
            path.addCurve(to: to,
                          control1: CGPoint(x: from.x, y: from.y + reach),
                          control2: CGPoint(x: to.x, y: to.y - reach))
            // The last step into a frontier concept is the one the learner is
            // about to take: it gets the colour, everything else stays hairline.
            let next = store.display[link.into] == .frontier
            context.stroke(
                path,
                with: .color(next
                    ? NodeState.frontier.color.opacity(0.5)
                    : Palette.ink.opacity(link.dashed ? 0.09 : 0.15)),
                style: .init(lineWidth: next ? 2 : 1.4, lineCap: .round,
                             dash: link.dashed ? [4, 5] : [])
            )
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

// MARK: - One concept

/// A concept on the map: the disc, its name under it, and what it is called
/// when that is worth saying. Everything about a level's arrangement is the
/// layout's business — this only has to draw one of them.
private struct NodeMark: View {
    let node: ConceptNode
    let state: NodeState
    let selected: Bool
    let open: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false

    /// The frontier is the biggest disc on the map and untouched territory the
    /// smallest — size carries "where am I" before colour does.
    private var diameter: CGFloat {
        switch state {
        case .frontier: 28
        case .unknown: 22
        case .gap: 24
        default: 25
        }
    }

    var body: some View {
        Button(action: open) {
            VStack(spacing: 6) {
                // A fixed zone, so every disc on a level sits on the same line
                // whatever size its state gives it.
                disc.frame(height: 52)
                Text(verbatim: node.label)
                    .font(.atlas(.serif, state == .frontier ? 14.5 : 13.5))
                    .foregroundStyle(state == .unknown ? Palette.inkMuted : Palette.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    // A name is never printed over an edge, only in the paper
                    // around one: an edge from three levels up runs straight
                    // through the middle of this level on its way past.
                    .padding(.horizontal, 5)
                    .background(Palette.paper.opacity(0.92), in: .rect(cornerRadius: 7))
                // Untouched territory says nothing: the pale disc is the whole
                // message, and a grid of "Desconhecido" under the half of the
                // map nobody has reached is noise.
                if state != .unknown {
                    Text(state.headline)
                        .font(.atlas(.sans, 10.5))
                        .foregroundStyle(state == .frontier ? Palette.amberInk : Palette.inkMuted)
                        .lineLimit(1)
                        .padding(.horizontal, 5)
                        .background(Palette.paper.opacity(0.92), in: .capsule)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text("Abrir o conceito"))
    }

    private var disc: some View {
        let size = diameter
        return ZStack {
            // The glow is the design's one flourish, and every lit concept gets
            // it — the frontier's is simply the brightest.
            if state != .unknown {
                Circle().fill(state.color.opacity(state == .frontier ? 0.16 : 0.10))
                    .frame(width: size * 1.75, height: size * 1.75)
                Circle().strokeBorder(state.color.opacity(state == .frontier ? 0.4 : 0.25), lineWidth: 1.5)
                    .frame(width: size * 1.75, height: size * 1.75)
            }
            if state == .frontier {
                // The map's only motion, and it is the one thing worth
                // animating: where to go next. Under Reduce Motion the ring
                // above still marks it.
                Circle().strokeBorder(state.color.opacity(0.45), lineWidth: 1.5)
                    .frame(width: size, height: size)
                    .scaleEffect(pulsing && !reduceMotion ? 1.75 : 1)
                    .opacity(pulsing && !reduceMotion ? 0 : 0.9)
                    .animation(
                        reduceMotion ? nil : .easeOut(duration: 1.9).repeatForever(autoreverses: false),
                        value: pulsing
                    )
            }
            // A paper ring first, so the edges running under a pale disc stop
            // showing through it.
            Circle().fill(Palette.paper).frame(width: size + 7, height: size + 7)
            Circle().fill(state.color.opacity(state == .unknown ? 0.4 : 1))
                .frame(width: size, height: size)
                .shadow(color: state.color.opacity(state == .unknown ? 0 : 0.3), radius: 5, y: 2)
            if selected {
                Circle().strokeBorder(Palette.ink.opacity(0.3), lineWidth: 1.5)
                    .frame(width: size * 1.75 + 7, height: size * 1.75 + 7)
            }
            glyph
        }
        .task { pulsing = true }
    }

    /// What the disc carries: a tick for a concept already learned, a pip for
    /// one the learner can start now, nothing at all for territory ahead.
    @ViewBuilder
    private var glyph: some View {
        if state.isLearned {
            Image(systemName: "checkmark")
                .font(.system(size: diameter * 0.44, weight: .bold))
                .foregroundStyle(Palette.accentInk)
        } else if state == .frontier {
            Circle().fill(Palette.accentInk).frame(width: 7, height: 7)
        }
    }
}
