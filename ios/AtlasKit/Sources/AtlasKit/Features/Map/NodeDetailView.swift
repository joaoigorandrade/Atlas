import Navigation
import SwiftUI

/// "Detalhe do nó" — the desktop drawer as a self-sizing bottom sheet: what
/// state the node is in, what it is, where it sits in the spiral, and the one
/// action to take.
struct NodeDetailView: View {
    let node: ConceptNode
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @State private var model: NodeDetailViewModel?

    /// The tallest the scrolling part may be: the screen, less the sheet's top
    /// inset, the handle strip and the dock with both of its buttons.
    private static var scrollCap: CGFloat {
        let screen = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.screen.bounds.height ?? 800
        return max(240, screen - 290)
    }

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear.frame(height: 1) }
        }
        // Fill the detent rather than be measured by the content. Sized to its
        // content the stack ran past the sheet at the accessibility sizes and
        // took the dock with it, so there was no way to start the phase at all
        // — this is what puts the CTA back on screen. The drag indicator
        // drawing over the header is fixed below; whether the header can still
        // be scrolled off at AX sizes is a separate question and still open.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.cardAlt)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        // Keyed on the node: SwiftUI reuses a sheet's view across two
        // presentations of the same route, and a stale model would draw the
        // previous node's spiral against this one's name.
        .task(id: node.id) {
            model = NodeDetailViewModel(node: node, store: store)
            model?.warm()
        }
    }

    @ViewBuilder
    private func content(_ model: NodeDetailViewModel) -> some View {
        VStack(spacing: 0) {
            // The strip the system draws the drag indicator into. A sibling of
            // the scroll view, not an inset on it: scroll content is *meant* to
            // pass under a safe-area inset, which is exactly the thing being
            // stopped here — scrolled a little, the node's summary had the
            // handle sitting on the words.
            Color.clear.frame(height: 22)
            // At AX sizes the header, the spiral and the chips are taller than
            // any sheet — without this the dock is pushed off the screen.
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header(model)
                    if model.isGap { repair(model) } else { spiral(model) }

                    let prereqs = model.prerequisites
                    if !prereqs.isEmpty {
                        // A locked node's prerequisites are not trivia about it,
                        // they are the way in — the web names them as such.
                        Kicker(model.isLocked ? "Aprenda isso primeiro" : "Pré-requisitos").padding(.top, 20)
                        FlowChips(prereqs, open: reopen).padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 20)
            }
            // The navigator sizes every sheet to its content (`fixedSize`), and
            // a scroll view's content size is all of it: a twelve-rung plan ran
            // past the sheet at both ends — the title under the handle, the dock
            // off the bottom. Capping the scroll's height to what the screen
            // leaves around the dock is what makes it scroll instead.
            .frame(maxHeight: Self.scrollCap)

            Dock {
                CTAButton(model.actionTitle, tint: model.actionTint) { primary(model) }
                    .disabled(model.isLocked)
                // The faster lever, proven rather than claimed: straight to the
                // proof gate. Frontier only, so a failed proof can't be re-armed
                // for a second try at the same problem (`NodeDetail.tsx:634`).
                if model.state == .frontier {
                    GhostButton("Eu já sei isso — provar") { start(model.prove()) }
                }
            }
        }
    }

    private func header(_ model: NodeDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle().fill(model.state.color).frame(width: 11, height: 11)
                    .shadow(color: model.state.color, radius: 3.5)
                Kicker(model.headline, tint: model.state.color, size: 11)
            }
            Text(verbatim: node.label)
                .font(.atlas(.display, 26))
                .foregroundStyle(Palette.ink)
                .padding(.top, 6)
            if let cost = model.cost {
                Text(verbatim: cost)
                    .font(.atlas(.serif, 14))
                    .foregroundStyle(Palette.inkFaint)
                    .padding(.top, 4)
            }

            if let summary = node.summary {
                Text(verbatim: summary)
                    .font(.atlas(.serif, 15))
                    .foregroundStyle(Palette.inkSoft)
                    .padding(.horizontal, 15).padding(.vertical, 13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.card)
                    .overlay(alignment: .leading) { Rectangle().fill(model.state.color).frame(width: 3) }
                    .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.hairline, lineWidth: 1) }
                    .clipShape(.rect(cornerRadius: 3))
                    .padding(.top, 14)
            }

            if let nextReview = model.nextReview {
                Text(verbatim: nextReview)
                    .font(.atlas(.serif, 14.5))
                    .foregroundStyle(Palette.inkSoft)
                    .padding(.top, 14)
            }

            if let shakyLine = model.shakyLine {
                Text(shakyLine)
                    .font(.atlas(.serif, 14.5))
                    .foregroundStyle(Palette.inkSoft)
                    .padding(.top, 14)
            }
        }
    }

    @ViewBuilder
    private func spiral(_ model: NodeDetailViewModel) -> some View {
        Kicker("Espiral de fases").padding(.top, 22)
        VStack(spacing: 2) {
            ForEach(model.rows) { row($0, model) }
        }
        .padding(.top, 10)
        .animation(Motion.enter, value: model.pendingSkip)

        if let pendingSkip = model.pendingSkip, let owed = model.owed {
            nudge(skipping: owed, to: pendingSkip, model).padding(.top, 12)
        }
    }

    /// A gap has no spiral to walk: one Socratic pass closes it, and saying so
    /// is the whole panel. Mirrors `NodeDetail.tsx:340-379`.
    @ViewBuilder
    private func repair(_ model: NodeDetailViewModel) -> some View {
        let tint = model.state.color
        Kicker("Reparo direcionado").padding(.top, 22)
        HStack(spacing: 12) {
            Text(verbatim: "→")
                .font(.atlas(.serif, 13.5))
                .foregroundStyle(tint)
                .frame(width: 22, height: 22)
                .background(tint.opacity(0.14), in: .circle)
                .overlay { Circle().strokeBorder(tint, lineWidth: 1) }
            Text("Passagem socrática").font(.atlas(.serif, 16, weight: .semibold)).foregroundStyle(Palette.ink)
            Spacer(minLength: 0)
            Kicker("uma passagem · fecha esta lacuna", tint: Palette.inkMuted)
        }
        .padding(.horizontal, 15).padding(.vertical, 13)
        .frame(minHeight: Metrics.tap)
        .background(Palette.card, in: .rect(cornerRadius: 3))
        .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(tint.opacity(0.2), lineWidth: 1) }
        .padding(.top, 10)

        let parents = model.spawnedFrom
        if !parents.isEmpty {
            Kicker("Originado de").padding(.top, 20)
            FlowChips(parents, open: reopen).padding(.top, 10)
        }
    }

    /// A prerequisite chip: the drawer turns to that concept in place.
    private func reopen(_ other: ConceptNode) {
        navigator.openSheet(.nodeDetail(other))
    }

    /// The spiral is pushed from the map, never entered from a tab — a pass is
    /// not a destination without a node. `navigate` dismisses the drawer on the
    /// way, which is why there is no `onDismiss` dance left here.
    private func start(_ phase: Phase? = nil) {
        navigator.navigate(to: .session(node, phase: phase))
    }

    /// The dock's action is the same action a row is: naming Retido and then
    /// opening the Crisol is the one thing this button must never do.
    private func primary(_ model: NodeDetailViewModel) {
        guard let phase = model.action else { return }
        open(phase, model)
    }

    /// Done phases are green, the current one carries the node's colour, later
    /// ones read as inert but still answer: tapping ahead asks first. Mirrors
    /// the web's phase list — every row of an unlocked node is a button.
    private func row(_ row: NodeDetailViewModel.PhaseRow, _ model: NodeDetailViewModel) -> some View {
        HStack(spacing: 12) {
            Text(verbatim: row.done ? "✓" : row.isCurrent ? "→" : "·")
                .font(.atlas(.serif, 13.5))
                .foregroundStyle(row.tint)
                .frame(width: 24, height: 24)
                .background(row.isCurrent ? model.state.color.opacity(0.14) : .clear, in: .circle)
                .overlay { Circle().strokeBorder(row.done || row.isCurrent ? row.tint : Palette.hairlineStrong, lineWidth: 1) }
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: row.phase.label)
                    .font(.atlas(.serif, 16.5, weight: row.isCurrent ? .semibold : .regular))
                    .foregroundStyle(row.done || row.isCurrent ? Palette.ink : Palette.inkGhost)
                // What the rung asks of the learner: twelve English names
                // on their own said nothing about the work behind them.
                Text(row.phase.blurb)
                    .font(.atlas(.serif, 13.5))
                    .foregroundStyle(row.done || row.isCurrent ? Palette.inkMuted : Palette.inkGhost)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if row.isCurrent {
                Kicker("próximo", tint: model.state.color)
            } else if row.done {
                Kicker("refazer", tint: NodeState.mastered.color)
            }
        }
        .frame(minHeight: 46)
        .padding(.horizontal, 4)
        .contentShape(.rect)
        // One element, read as a button: VoiceOver read the glyph, the name and
        // the kicker as three things, none of them saying it could be opened.
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .onTapGesture {
            guard model.current >= 0 else { return }
            if row.isAhead { model.pendingSkip = row.phase } else { open(row.phase, model) }
        }
    }

    /// The one way into a phase from this drawer. Retido is the review rather
    /// than a pass — the same fork `onPhaseAction` takes on the web.
    private func open(_ phase: Phase, _ model: NodeDetailViewModel) {
        model.pendingSkip = nil
        model.disarm()
        if phase == .retain {
            navigator.dismissSheet()
            tabs.switchTab(to: .review)
        } else {
            start(phase)
        }
    }

    /// Tapping past the recommended phase is allowed — it is asked about once,
    /// naming what would be skipped, and the learner decides. `useSpiral`'s
    /// state bump on the way through is already `SessionViewModel`'s job.
    private func nudge(skipping owed: Phase, to target: Phase, _ model: NodeDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(owed.skipNudge)
                .font(.atlas(.serif, 15))
                .foregroundStyle(Palette.amberInk)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button { open(owed, model) } label: {
                    Text("Fazer \(owed.label) primeiro")
                        .font(.atlas(.serif, 14.5, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .padding(.horizontal, 13)
                        .frame(minHeight: Metrics.tap)
                        .background(Palette.accent, in: .rect(cornerRadius: 3))
                }
                .pressable()
                Button { open(target, model) } label: {
                    Text("Pular para \(target.label) →")
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.amberInk)
                        .underline()
                        .padding(.horizontal, 13)
                        .frame(minHeight: Metrics.tap)
                        .contentShape(.rect)
                }
                .pressable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 15).padding(.vertical, 13)
        .background(Palette.amberBg, in: .rect(cornerRadius: 3))
        .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.amberInk.opacity(0.25), lineWidth: 1) }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

/// Prerequisite chips wrap — there are two on one node and five on another.
/// A grid gives every chip the widest one's width; chips are the width of
/// their own word, so this is the one place a `Layout` earns itself.
struct FlowChips: View {
    private let items: [(ConceptNode, NodeState)]
    /// Each chip opens its concept: on a locked node they are the way in.
    private let open: (ConceptNode) -> Void
    init(_ items: [(ConceptNode, NodeState)], open: @escaping (ConceptNode) -> Void) {
        self.items = items; self.open = open
    }
    var body: some View {
        Flow(spacing: 7) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                Button { open(item.0) } label: {
                    Chip(verbatim: item.0.label, dot: item.1.color)
                        .frame(minHeight: Metrics.tap)
                        .contentShape(.rect)
                }
                .pressable()
                .accessibilityHint(Text("Abrir o conceito"))
            }
        }
    }
}

/// Left-aligned wrapping row — `flex-wrap: wrap` and nothing else.
struct Flow: Layout {
    var spacing: CGFloat = 7

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(subviews, width: proposal.width ?? .infinity)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(subviews, width: bounds.width) {
            var x = bounds.minX
            for item in row.items {
                subviews[item].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: .unspecified)
                x += subviews[item].sizeThatFits(.unspecified).width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func rows(_ subviews: Subviews, width limit: CGFloat) -> [Row] {
        var rows = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let used = rows[rows.count - 1].width
            if used > 0, used + size.width > limit { rows.append(Row()) }
            var row = rows[rows.count - 1]
            row.items.append(index)
            row.width += size.width + (row.items.count > 1 ? spacing : 0)
            row.height = max(row.height, size.height)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
