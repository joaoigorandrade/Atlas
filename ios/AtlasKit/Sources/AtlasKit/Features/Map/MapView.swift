import Navigation
import SwiftUI

/// "Mapa" — the trail, and a slim footer that says where the run stands. The
/// map reads as one walk down the screen, foundations at the top and the
/// frontier somewhere below: a level with more concepts than fit across wraps
/// onto the next line rather than running off the side, so the page only ever
/// scrolls one way. A pinch pulls back to see the whole territory. Selecting a
/// step opens the node drawer through the navigator; starting a pass is pushed
/// from there.
public struct MapView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model = MapViewModel()

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            TopBar {
                mapSwitcher
            } trailing: {
                HStack(spacing: 4) {
                    // A finished map has no frontier: an amber "0" would read as
                    // work left over.
                    if store.frontier.count > 0 {
                        Chip(verbatim: "\(store.frontier.count)", dot: NodeState.frontier.color,
                             tint: Palette.amberInk, background: Palette.amberBg)
                            .contentTransition(.numericText())
                            .accessibilityLabel(Text("\(store.frontier.count) conceitos na fronteira"))
                    }
                    Button { withAnimation(Motion.standard) { model.legend.toggle() } } label: {
                        Image(systemName: model.legend ? "info.circle.fill" : "info.circle")
                            .font(.system(size: 17))
                            .foregroundStyle(Palette.inkMuted)
                            .frame(width: Metrics.tap, height: Metrics.tap)
                    }
                    .pressable()
                    .accessibilityLabel(model.legend ? "Esconder a legenda" : "Mostrar a legenda")
                }
            }

            if model.legend { legend.transition(.opacity.combined(with: .move(edge: .top))) }

            trail
            footer
        }
        .background(Palette.paper)
        // A pass ending changes the trail underneath this screen: the frontier
        // count moves, a step's disc fills, the footer's next node changes.
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
        // The whole frontier: a hit is a local read from the mirror, then a
        // shared-cache read, and only a genuine miss reaches a model.
        .task(id: store.frontier.map(\.id).joined()) {
            // The head of each frontier node's *own* plan — the day a ladder
            // starts elsewhere this warms the phase the node actually opens on.
            for node in store.frontier {
                guard let first = planGates(node.plan).first else { continue }
                store.warmUp(first, for: node)
            }
        }
        // Not keyed on the frontier: the day's deck is drawn from the nodes
        // with no card yet, which has nothing to do with the frontier's order.
        .task { store.warmRetain() }
    }

    private func open(_ node: ConceptNode) {
        model.select(node)
        navigator.openSheet(.nodeDetail(node))
    }

    // MARK: - The title: which map, and the way to another

    /// The subject is the page's name, and the one control that changes it —
    /// a map is switched from where it is read, not only from Início.
    private var mapSwitcher: some View {
        Menu {
            ForEach(store.maps) { map in
                Button {
                    Task {
                        model.switching = map.id
                        await store.switchTo(map)
                        model.switching = nil
                    }
                } label: {
                    if map.id == store.topicId {
                        Label { Text(verbatim: map.subject) } icon: { Image(systemName: "checkmark") }
                    } else {
                        Text(verbatim: map.subject)
                    }
                }
            }
        } label: {
            HStack(spacing: 7) {
                VStack(alignment: .leading, spacing: 1) {
                    Kicker("Mapa")
                    Text(verbatim: store.subject.isEmpty ? "Atlas" : store.subject)
                        .font(.atlas(.display, 19))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                }
                if model.switching != nil {
                    ProgressView().controlSize(.small)
                } else if store.maps.count > 1 {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Palette.inkFaint)
                }
            }
            .frame(minHeight: Metrics.tap)
            .contentShape(.rect)
        }
        .disabled(store.maps.count < 2 || model.switching != nil)
        .accessibilityLabel(Text("Trocar de mapa"))
        .accessibilityValue(Text(verbatim: store.subject))
    }

    // MARK: - The legend

    /// What the colours and the sizes mean — the web's rail carries this beside
    /// the map; here it is a strip the learner opens when they wonder.
    private var legend: some View {
        VStack(alignment: .leading, spacing: 10) {
            Flow(spacing: 7) {
                ForEach([NodeState.frontier, .learning, .shaky, .mastered, .gap, .unknown], id: \.self) { state in
                    Chip(state.legend, dot: state.color)
                }
            }
            Text("O círculo que pulsa é por onde começar. Discos menores, com o nome em itálico, são conceitos para usar ou só reconhecer — não para dominar.")
                .font(.atlas(.serif, 14.5))
                .foregroundStyle(Palette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Metrics.gutter)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.cardAlt)
        .overlay(alignment: .bottom) { Divider().overlay(Palette.hairline) }
    }

    // MARK: - The trail

    private var trail: some View {
        // One read of the width: the layout is built against it, and a
        // GeometryReader per level would re-measure the same number for each.
        GeometryReader { geo in
            let map = model.trail(store.graph, width: geo.size.width)
            let zoom = model.zoom
            ScrollViewReader { proxy in
                ScrollView(zoom > 1 ? [.horizontal, .vertical] : .vertical) {
                    ZStack(alignment: .topLeading) {
                        // Every edge in one canvas, over the whole map: an edge
                        // reaching back three levels has to be drawn across the
                        // bands it crosses, and a canvas per band would clip it.
                        Canvas { context, _ in draw(map, into: &context) }
                            .frame(width: map.size.width, height: map.size.height)
                        // The bands are real views, in order, so a concept can
                        // be scrolled to — one placed with `.position` has the
                        // band's frame, not its own.
                        VStack(spacing: 0) {
                            ForEach(Array(map.levels.enumerated()), id: \.offset) { band, row in
                                ZStack {
                                    ForEach(row) { placed in
                                        NodeMark(
                                            node: placed.node,
                                            state: store.display[placed.id] ?? .unknown,
                                            selected: model.selection?.id == placed.id,
                                            changed: model.landing == placed.id
                                        ) { open(placed.node) }
                                        .frame(width: TrailMap.slot - 12)
                                        .position(x: placed.at.x, y: TrailMap.band / 2)
                                    }
                                }
                                .frame(width: map.size.width, height: TrailMap.band)
                                .id(band)
                            }
                        }
                    }
                    // The pinch scales the drawing, and the frame follows it so
                    // the scroll view's content is the size it now looks.
                    .scaleEffect(zoom, anchor: .topLeading)
                    .frame(width: map.size.width * zoom, height: map.size.height * zoom, alignment: .topLeading)
                    .padding(.bottom, 12)
                }
                .scrollIndicators(.hidden)
                .simultaneousGesture(
                    MagnifyGesture()
                        .onChanged { model.pinch($0.magnification) }
                        .onEnded { _ in model.settlePinch() }
                )
                // Landing on the work is the whole point: the concept a pass
                // just changed, or the one to start next — not the foundations
                // finished weeks ago. No animation: this is where the screen opens.
                .onAppear { land(map, proxy, animated: false) }
                // Another map opened underneath this screen, or a pass came
                // back with something to show.
                .onChange(of: store.subject) { _, _ in land(map, proxy, animated: false) }
                .onChange(of: store.lastChanged) { _, _ in land(map, proxy, animated: true) }
                .overlay(alignment: .bottomTrailing) {
                    Button { recenter(map, proxy) } label: {
                        Image(systemName: "scope")
                            .font(.system(size: 17))
                            .foregroundStyle(Palette.inkSoft)
                            .frame(width: Metrics.tap, height: Metrics.tap)
                            .background(Palette.card, in: .circle)
                            .overlay { Circle().strokeBorder(Palette.rule, lineWidth: 1) }
                            .shadow(color: Palette.shade(0.12), radius: 6, y: 2)
                    }
                    .pressable()
                    .padding(14)
                    .accessibilityLabel("Ir para o próximo conceito")
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Scroll to the concept worth looking at, centred on its line. A pass that
    /// just changed a node gets that node, with its new state landing a beat
    /// after the scroll; otherwise the next step on the frontier.
    private func land(_ map: TrailMap, _ proxy: ScrollViewProxy, animated: Bool) {
        let target = store.lastChanged ?? store.frontier.first?.id
        guard let target, let placed = map.placed.first(where: { $0.id == target }) else { return }
        if animated {
            withAnimation(Motion.enter) { proxy.scrollTo(placed.level, anchor: .center) }
        } else {
            proxy.scrollTo(placed.level, anchor: .center)
        }
        guard let changed = store.lastChanged else { return }
        store.lastChanged = nil
        model.land(changed)
    }

    /// Back to the next step, at the size the map was drawn for.
    private func recenter(_ map: TrailMap, _ proxy: ScrollViewProxy) {
        model.resetZoom()
        guard let target = store.frontier.first,
              let placed = map.placed.first(where: { $0.id == target.id }) else { return }
        withAnimation(Motion.enter) { proxy.scrollTo(placed.level, anchor: .center) }
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
            // about to take: it gets the gilt, everything else stays an ink road.
            let next = store.display[link.into] == .frontier
            context.stroke(
                path,
                with: .color(next
                    ? Palette.gilt.opacity(0.7)
                    : Palette.ink.opacity(link.dashed ? 0.16 : 0.32)),
                style: .init(lineWidth: next ? 2 : 1.2, lineCap: .round,
                             dash: link.dashed ? [4, 5] : [])
            )
        }
    }

    // MARK: - The footer

    /// Where the run stands and the next step — the subject moved up to the
    /// title, so this is one reading and one button, not a second header.
    private var footer: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Território dominado").font(.atlas(.serif, 15)).foregroundStyle(Palette.inkMuted)
                    Spacer()
                    Text(verbatim: store.mastered.formatted(.percent.precision(.fractionLength(0))))
                        .font(.atlas(.display, 20)).foregroundStyle(Palette.accent)
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
                Button { open(next) } label: {
                    HStack(spacing: 10) {
                        Kicker("Próximo", tint: Palette.amberInk)
                        Text(verbatim: next.label).font(.atlas(.serif, 16.5)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(Palette.inkFaint)
                    }
                    .padding(.horizontal, 13)
                    .frame(minHeight: Metrics.tap)
                    .background(Palette.card)
                    .plate()
                }
                .pressable()
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(Motion.reward, value: store.mastered)
        .padding(.horizontal, Metrics.gutter)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(Palette.cardAlt)
        .overlay(alignment: .top) { DoubleRule() }
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
    /// The concept a pass just changed: it lands with the reward spring, which
    /// is what the design reserves for a concept going green.
    let changed: Bool
    let open: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false
    @State private var landing = false

    /// The frontier is the biggest disc on the map and untouched territory the
    /// smallest — size carries "where am I" before colour does.
    private var diameter: CGFloat {
        let base: CGFloat = switch state {
        case .frontier: 28
        case .unknown: 22
        case .gap: 24
        default: 25
        }
        return switch rank {
        case .core: base
        case .working: base * 0.8
        case .peripheral: base * 0.65
        }
    }

    /// The bar the concept is held to, drawn as the web's settlement rank: a
    /// city to master, a town to use a size down, a village to recognise a size
    /// below that — both lesser ranks with their names in italic. The button's
    /// reach is unchanged. A gap is a sub-point of its parent, drawn full size.
    private var rank: NodeImportance { state == .gap ? .core : node.importance ?? .core }
    private var town: Bool { rank != .core }

    var body: some View {
        Button(action: open) {
            VStack(spacing: 6) {
                // A fixed zone, so every disc on a level sits on the same line
                // whatever size its state gives it.
                disc.frame(height: 52)
                Text(verbatim: node.label)
                    .font(.atlas(.serif, state == .frontier ? 16 : 15))
                    .italic(town)
                    .foregroundStyle(state == .unknown ? Palette.inkMuted : Palette.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    // Fell's italic leans past the width it measures at, and
                    // the neighbour's label covered the overhang ("Funçõe"):
                    // a narrower measure makes it wrap before it spills.
                    .frame(maxWidth: town ? TrailMap.slot - 34 : nil)
                    // A name is never printed over an edge, only in the paper
                    // around one: an edge from three levels up runs straight
                    // through the middle of this level on its way past.
                    .padding(.horizontal, 5)
                    .background(Palette.paper.opacity(0.92), in: .rect(cornerRadius: 3))
                // Untouched territory says nothing: the pale disc is the whole
                // message, and a grid of "Desconhecido" under the half of the
                // map nobody has reached is noise. Nor does the frontier: its
                // pulse says it, and sixteen "Fronteira · pronto" in a row was
                // the loudest thing on the map. The legend names both.
                if state != .unknown && state != .frontier {
                    Text(state.legend)
                        .font(.atlas(.serif, 12.5))
                        .foregroundStyle(state == .frontier ? Palette.amberInk : Palette.inkMuted)
                        .lineLimit(1)
                        .padding(.horizontal, 5)
                        .background(Palette.paper.opacity(0.92), in: .capsule)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .scaleEffect(landing ? 1.18 : 1)
        .animation(reduceMotion ? nil : Motion.spring, value: landing)
        .task(id: changed) {
            guard changed else { return }
            try? await Task.sleep(for: .seconds(0.45))
            landing = true
            try? await Task.sleep(for: .seconds(0.7))
            landing = false
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
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
