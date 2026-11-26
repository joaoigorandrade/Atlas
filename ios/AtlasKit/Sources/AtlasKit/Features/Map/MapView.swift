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
    @Environment(\.colorScheme) private var scheme
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

            TopicAxesView()
            if model.legend { legend.transition(.opacity.combined(with: .move(edge: .top))) }

            trail
            footer
        }
        .paper()
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
            guard store.goal != .glance else { return } // warmed from the shell
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
                    ChartingMark(compact: true)
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
            let sheet = AtlasInput(map, display: store.display, dark: scheme == .dark)
            ScrollViewReader { proxy in
                ScrollView(zoom > 1 ? [.horizontal, .vertical] : .vertical) {
                    ZStack(alignment: .topLeading) {
                        // The whole sheet in one canvas, under every city: a
                        // road reaching back three levels has to be drawn
                        // across the bands it crosses, and a canvas per band
                        // would clip it.
                        Canvas { context, _ in draw(map, into: &context) }
                            .frame(width: map.size.width, height: map.size.height)
                        // The bands are real views, in order, so a concept can
                        // be scrolled to — one placed with `.position` has the
                        // band's frame, not its own.
                        let retention = nodeRetention(store.cards)
                        VStack(spacing: 0) {
                            ForEach(Array(map.levels.enumerated()), id: \.offset) { band, row in
                                ZStack {
                                    ForEach(row) { placed in
                                        NodeMark(
                                            node: placed.node,
                                            state: store.display[placed.id] ?? .unknown,
                                            capital: map.capitals[placed.id] != nil,
                                            selected: model.selection?.id == placed.id,
                                            changed: model.landing == placed.id,
                                            fade: retention[placed.id]
                                        ) { open(placed.node) }
                                        // The city on its territory's heart, so
                                        // the baked land sits under it.
                                        .position(x: placed.at.x, y: TrailMap.band / 2)
                                    }
                                }
                                .frame(width: map.size.width, height: TrailMap.band)
                                .id(band)
                            }
                        }
                        .padding(.vertical, TrailMap.shore)
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
                // The atlas is baked off the main actor and repainted whenever
                // a territory changes hands, the layout moves or the light does.
                .task(id: sheet) { await model.paint(sheet) }
                .overlay(alignment: .bottomTrailing) {
                    Button { recenter(map, proxy) } label: {
                        Image(systemName: "scope")
                            .font(.system(size: 17))
                            .foregroundStyle(Palette.inkSoft)
                            .frame(width: Metrics.tap, height: Metrics.tap)
                            .glassEffect(.regular.interactive(), in: .circle)
                    }
                    .buttonStyle(.plain)
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

    /// The sheet under the cities, back to front: the graticule, the baked land
    /// (`AtlasTerrain`), the countries' names, the roads, the fog, and the
    /// relief beside each city. Direction is the layout's job — a prerequisite
    /// is always above what it unlocks — so there are no arrowheads.
    private func draw(_ map: TrailMap, into context: inout GraphicsContext) {
        let sheet = CGRect(origin: .zero, size: map.size)
        var grid = Path()
        for x in stride(from: 0, through: sheet.width, by: 104) {
            grid.move(to: CGPoint(x: x, y: 0))
            grid.addLine(to: CGPoint(x: x, y: sheet.height))
        }
        for y in stride(from: 0, through: sheet.height, by: 104) {
            grid.move(to: CGPoint(x: 0, y: y))
            grid.addLine(to: CGPoint(x: sheet.width, y: y))
        }
        context.stroke(grid, with: .color(MapInk.graticule), lineWidth: 1)

        let atlas = model.atlas
        if let atlas {
            context.draw(Image(decorative: atlas.land, scale: 1).interpolation(.high), in: sheet)
            // Set like a country on an engraved atlas: widely spaced capitals.
            for spot in atlas.spots {
                context.draw(
                    Text(verbatim: spot.name.uppercased())
                        .font(.atlas(.serif, spot.size, weight: .semibold))
                        .tracking(spot.spacing)
                        .foregroundStyle(MapInk.countryInk),
                    at: spot.at
                )
            }
        }

        // What a road looks like says what walking it means (`MapEdges.tsx`):
        // solid ink between two concepts already reached, a gilt trail into
        // the frontier, a faint dotted track through ground nobody has
        // reached, and the re-planner's red dashes out to a gap.
        let shown = store.display
        for link in map.links {
            let from = shown[link.out] ?? .unknown, to = shown[link.into] ?? .unknown
            let trail = !link.dashed && from != .unknown && to == .frontier
            let road = !link.dashed && from != .unknown && to != .unknown && !trail
            let reach = (link.to.y - link.from.y) * 0.45
            var path = Path()
            path.move(to: link.from)
            path.addCurve(to: link.to,
                          control1: CGPoint(x: link.from.x, y: link.from.y + reach),
                          control2: CGPoint(x: link.to.x, y: link.to.y - reach))
            let (ink, width, dash): (Color, CGFloat, [CGFloat]) =
                link.dashed ? (NodeState.gap.color.opacity(0.6), 1.3, [5, 6])
                : trail ? (Palette.gilt, 2, [7, 6])
                : road ? (MapInk.road, 1.8, [])
                : (MapInk.track, 1.3, [1.5, 5])
            context.stroke(path, with: .color(ink), style: .init(lineWidth: width, lineCap: .round, dash: dash))
        }

        if let atlas {
            context.draw(Image(decorative: atlas.fog, scale: 1).interpolation(.high), in: sheet)
        }
        for placed in map.placed where shown[placed.id] != .gap {
            relief(placed.node.difficulty, at: placed.at, muted: (shown[placed.id] ?? .unknown) == .unknown,
                   into: context)
        }
    }

    /// How hard the climb is, drawn up and to the left of the city as an
    /// engraved atlas draws a place (`Relief.tsx`): nothing on the lowland, one
    /// hachured hill, or a small range of peaks shaded on the lee side.
    private func relief(_ difficulty: NodeDifficulty?, at city: CGPoint, muted: Bool, into context: GraphicsContext) {
        guard difficulty != .easy else { return }
        var context = context
        context.translateBy(x: city.x, y: city.y)
        context.scaleBy(x: 1.7, y: 1.7) // the web's 1.3, on a city a size up (`NodeMark.scale`)
        let ink = GraphicsContext.Shading.color(muted ? Palette.inkGhost : Palette.inkMuted)
        func hill(_ x: CGFloat, _ y: CGFloat) {
            var arc = Path()
            arc.move(to: CGPoint(x: x - 6, y: y))
            arc.addQuadCurve(to: CGPoint(x: x + 6, y: y), control: CGPoint(x: x, y: y - 7))
            context.stroke(arc, with: ink, lineWidth: 1)
            var hatch = Path()
            for (a, b) in [((1.0, -3.0), (2.4, -0.4)), ((2.6, -2.4), (3.9, -0.3)), ((-0.6, -3.4), (0.6, -0.9))] {
                hatch.move(to: CGPoint(x: x + a.0, y: y + a.1))
                hatch.addLine(to: CGPoint(x: x + b.0, y: y + b.1))
            }
            context.stroke(hatch, with: ink, lineWidth: 0.55)
        }
        func peak(_ x: CGFloat, _ y: CGFloat, _ height: CGFloat = 11) {
            var face = Path()
            face.move(to: CGPoint(x: x - 5.5, y: y))
            face.addLine(to: CGPoint(x: x, y: y - height))
            face.addLine(to: CGPoint(x: x + 5.5, y: y))
            context.fill(face, with: .color(Palette.paper))
            context.stroke(face, with: ink, style: .init(lineWidth: 1, lineJoin: .round))
            var hatch = Path()
            for dx in [1.3, 2.6, 3.9] {
                hatch.move(to: CGPoint(x: x + dx, y: y - height + dx / 5.5 * height + 1))
                hatch.addLine(to: CGPoint(x: x + dx, y: y))
            }
            context.stroke(hatch, with: ink, lineWidth: 0.55)
        }
        if difficulty == .hard {
            hill(-25, -5); peak(-19, -7, 9); peak(-12, -10)
        } else {
            hill(-16, -9)
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
                ProgressBar(value: store.mastered)
            }
            // The label, the figure and the bar are one reading, not three —
            // the bar alone has no name at all.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Território dominado"))
            .accessibilityValue(Text(verbatim: store.mastered.formatted(.percent.precision(.fractionLength(0)))))

            // The Frontier Feed, once a reading on the frontier has been written
            // (`MapInvite`). The mock exam it offers on a finished web map has
            // no screen here yet.
            if !store.feedReady.isEmpty {
                Button { navigator.navigate(to: .feed) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "safari")
                            .font(.system(size: 22, weight: .light))
                            .foregroundStyle(Palette.gilt)
                        VStack(alignment: .leading, spacing: 2) {
                            Kicker("Feed da fronteira · \(store.ink) de tinta", tint: Palette.gilt, size: 9.5)
                            Text("Aposte sua tinta no que as próximas leituras perguntam")
                                .font(.atlas(.serif, 15.5))
                                .foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Text("Distribuir →").font(.atlas(.caps, 14)).foregroundStyle(Palette.gilt)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 10)
                    .frame(minHeight: Metrics.tap)
                    .background(Palette.card)
                    .plate()
                }
                .pressable()
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

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

/// A concept drawn the way a war map draws a city (`MapNode.tsx`): its
/// territory is the land baked under it (`AtlasTerrain`), and this is the town
/// mark at its heart — filled in its mastery colour, a country's capital ringed
/// twice, a mastered one sealed in wax — with its name hung underneath on a
/// paper halo. The frontier sends out a gilt beacon. The city sits exactly on
/// its point, so the land, the roads and the mark agree.
private struct NodeMark: View {
    let node: ConceptNode
    let state: NodeState
    /// The concept its country is named after.
    let capital: Bool
    let selected: Bool
    /// The concept a pass just changed: it lands with the reward spring, which
    /// is what the design reserves for a concept going green.
    let changed: Bool
    /// Its review deck's retrievability (`nodeRetention`), when reviewed.
    let fade: Double?
    let open: () -> Void

    /// The button's reach, centred on the city.
    static let reach: CGFloat = 44
    /// The web's marks a size up: a phone is read at arm's length, and the web
    /// draws them inside a zoomed-out canvas.
    static let scale: CGFloat = 1.3

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false
    @State private var landing = false

    /// Not reached yet: drawn in a fainter ink, as the web locks it.
    private var locked: Bool { state == .unknown }

    /// The bar the concept is held to, as settlement rank: a city to master, a
    /// town to use, a village to recognise — both lesser ranks with their names
    /// in italic. A gap is drawn as a town, its ring dashed.
    private var rank: NodeImportance { state == .gap ? .working : node.importance ?? .core }
    private var italic: Bool { state == .gap || (!capital && rank != .core) }

    /// One length per settlement: the capital's, the city's, the town's, the
    /// village's.
    private func sized(_ capital: CGFloat, _ city: CGFloat, _ town: CGFloat, _ village: CGFloat) -> CGFloat {
        if self.capital { return capital }
        return switch rank {
        case .core: city
        case .working: town
        case .peripheral: village
        }
    }

    /// A mastered city pales as its cards come due (W4.2): forgetting, shown
    /// where the learner plans.
    private var faded: Double {
        guard state == .mastered, let fade, fade < retentionTarget else { return 1 }
        return 0.4 + 0.6 * (fade / retentionTarget)
    }

    var body: some View {
        Button(action: open) {
            mark
                .frame(width: Self.reach, height: Self.reach)
                .contentShape(.rect)
                .overlay(alignment: .top) {
                    name
                        .frame(width: TrailMap.slot - 12)
                        .offset(y: Self.reach / 2 + 16 * Self.scale)
                }
        }
        .buttonStyle(.plain)
        .opacity(locked && !selected ? 0.62 : 1)
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
        .accessibilityValue(Text(state.legend))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(Text("Abrir o conceito"))
    }

    private var mark: some View {
        let k = Self.scale
        return ZStack {
            if state == .frontier {
                Circle().stroke(Palette.gilt.opacity(0.45), lineWidth: 1)
                    .frame(width: 28 * k, height: 28 * k)
                // The map's only motion, and the one thing worth animating:
                // where to go next. Under Reduce Motion the ring above marks it.
                Circle().stroke(Palette.gilt, lineWidth: 2)
                    .frame(width: 22 * k, height: 22 * k)
                    .scaleEffect(pulsing && !reduceMotion ? 2 : 1)
                    .opacity(pulsing && !reduceMotion ? 0 : 0.55)
                    .animation(
                        reduceMotion ? nil : .easeOut(duration: 2.6).repeatForever(autoreverses: false),
                        value: pulsing
                    )
            }
            if selected {
                Circle().stroke(Palette.accent, lineWidth: 2).frame(width: 34 * k, height: 34 * k)
            }
            city.opacity(faded)
            // Mastery is sealed: wax pressed over the city.
            if state == .mastered {
                WaxSeal().frame(width: sized(22, 18, 14, 11) * k, height: sized(22, 18, 14, 11) * k)
            }
        }
        .task { pulsing = true }
    }

    /// The settlement itself (`CityMark` in Relief.tsx): a city is a heavy ring
    /// with an ink dot at its heart, a town a small open ring, a village a
    /// smaller, finer one — and a capital a city ringed twice.
    @ViewBuilder
    private var city: some View {
        let fill = state == .unknown ? Palette.paper : state.color
        let ink = locked ? Palette.inkMuted : Palette.ink
        if capital {
            ring(9, fill: Palette.paper, ink: Palette.ink, line: 1.4)
            ring(5.5, fill: fill, ink: ink, line: 1.6)
            Circle().fill(Palette.ink).frame(width: 3.2 * Self.scale, height: 3.2 * Self.scale)
        } else {
            let (radius, line): (CGFloat, CGFloat) = switch rank {
            case .core: (6, 1.8)
            case .working: (4, 1.2)
            case .peripheral: (2.8, 0.9)
            }
            ring(radius, fill: fill, ink: ink, line: line, dash: state == .gap ? [2.5, 2] : [])
            if rank == .core {
                Circle().fill(ink).frame(width: 2.6 * Self.scale, height: 2.6 * Self.scale)
            }
        }
    }

    private func ring(_ radius: CGFloat, fill: Color, ink: Color, line: CGFloat, dash: [CGFloat] = []) -> some View {
        let k = Self.scale
        return Circle().fill(fill)
            .overlay(Circle().stroke(ink, style: StrokeStyle(lineWidth: line * k, dash: dash.map { $0 * k })))
            .frame(width: radius * 2 * k, height: radius * 2 * k)
    }

    /// The name, set under the city as an atlas sets it: a capital in small
    /// capitals, a town or a village in italic.
    private var name: some View {
        HStack(spacing: 5) {
            Text(verbatim: node.label)
                .font(.atlas(capital ? .caps : .display, sized(17.5, 15.5, 13.5, 12.5)))
                .italic(italic)
                .foregroundStyle(selected ? Palette.accent : locked ? Palette.inkMuted : Palette.ink)
                // Fell's italic leans past the width it measures at, and the
                // neighbour's label covered the overhang ("Funçõe"): a narrower
                // measure makes it wrap before it spills.
                .frame(maxWidth: italic ? TrailMap.slot - 34 : nil)
            if state == .gap {
                Text(NodeState.gap.legend)
                    .font(.atlas(.caps, 11))
                    .textCase(.uppercase)
                    .foregroundStyle(NodeState.gap.color)
                    .padding(.horizontal, 5)
                    .background(Palette.paper, in: .rect(cornerRadius: 2))
                    .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(NodeState.gap.color.opacity(0.4)))
                    .accessibilityHidden(true) // the value already says it
            }
        }
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
        // A paper halo, so a road or a border running under the name never
        // strikes through it.
        .shadow(color: Palette.paper, radius: 1.5)
        .shadow(color: Palette.paper, radius: 4)
        .contentShape(.rect)
    }
}

/// A wax seal — `WaxSeal` in components/ui/Ornaments.tsx: what the atlas
/// presses onto a concept once it is mastered. Drawn on the web's 22-unit box.
private struct WaxSeal: View {
    /// Sixteen lobes, as hot wax spreads from under a seal.
    private static let outline: Path = {
        var path = Path()
        for i in 0...32 {
            let angle = Double(i) / 32 * 2 * .pi - .pi / 2, r = i.isMultiple(of: 2) ? 10.0 : 8.9
            let point = CGPoint(x: cos(angle) * r, y: sin(angle) * r)
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }()

    private static let star: Path = {
        var path = Path()
        path.addLines([(0, -4), (1, -1), (4, 0), (1, 1), (0, 4), (-1, 1), (-4, 0), (-1, -1)].map { CGPoint(x: $0.0, y: $0.1) })
        path.closeSubpath()
        return path
    }()

    var body: some View {
        Canvas { context, size in
            context.translateBy(x: size.width / 2, y: size.height / 2)
            context.scaleBy(x: size.width / 22, y: size.height / 22)
            // The lighting is the wax's own, not a token: shade and gleam.
            let shade = Color.black, gleam = Color(red: 1, green: 235 / 255, blue: 210 / 255)
            context.fill(Self.outline.offsetBy(dx: 0.5, dy: 0.8), with: .color(Palette.rubric.opacity(0.35)))
            context.fill(Self.outline, with: .color(Palette.rubric))
            // The pressed face: a sunken ring, lit from the top-left.
            let face = Path(ellipseIn: CGRect(x: -6.4, y: -6.4, width: 12.8, height: 12.8))
            context.stroke(face, with: .color(shade.opacity(0.28)), lineWidth: 1.1)
            context.stroke(face.offsetBy(dx: -0.5, dy: -0.5), with: .color(gleam.opacity(0.3)), lineWidth: 0.6)
            // The device: a small compass star.
            context.fill(Self.star, with: .color(shade.opacity(0.3)))
            context.fill(Self.star.offsetBy(dx: -0.35, dy: -0.35), with: .color(gleam.opacity(0.28)))
            var glint = context
            glint.rotate(by: .degrees(-35))
            glint.fill(Path(ellipseIn: CGRect(x: -5.8, y: -5.5, width: 4.4, height: 2.2)), with: .color(gleam.opacity(0.35)))
        }
        .accessibilityHidden(true)
    }
}
