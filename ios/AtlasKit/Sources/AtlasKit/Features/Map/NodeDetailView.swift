import Navigation
import SwiftUI

/// "Detalhe do nó" — the desktop drawer as a self-sizing bottom sheet: what
/// state the node is in, what it is, where it sits in the spiral, and the one
/// action to take.
struct NodeDetailView: View {
    let node: ConceptNode
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: NodeDetailViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear.frame(height: 1) }
        }
        .background(Palette.cardAlt)
        .task { if model == nil { model = NodeDetailViewModel(node: node, store: store) } }
    }

    @ViewBuilder
    private func content(_ model: NodeDetailViewModel) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Circle().fill(model.state.color).frame(width: 11, height: 11)
                        .shadow(color: model.state.color, radius: 3.5)
                    Kicker(model.headline, tint: model.state.color, size: 11)
                }
                Text(node.label)
                    .font(.atlas(.serif, 26))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 6)

                if let summary = node.summary {
                    Text(summary)
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.inkSoft)
                        .padding(.horizontal, 15).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.card)
                        .overlay(alignment: .leading) { Rectangle().fill(model.state.color).frame(width: 3) }
                        .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(Palette.hairline, lineWidth: 1) }
                        .clipShape(.rect(cornerRadius: 9))
                        .padding(.top, 14)
                }

                Kicker("Espiral de fases").padding(.top, 22)
                VStack(spacing: 2) {
                    ForEach(Array(Phase.allCases.enumerated()), id: \.element) { row($1, at: $0, model) }
                }
                .padding(.top, 10)

                let prereqs = model.prerequisites
                if !prereqs.isEmpty {
                    Kicker("Pré-requisitos").padding(.top, 20)
                    FlowChips(prereqs).padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 18)
            .padding(.bottom, 20)

            Dock {
                CTAButton(model.actionTitle, tint: model.actionTint) { start() }
                    .disabled(model.isLocked)
                GhostButton("Já sei isso — pular") {
                    model.skip()
                    navigator.dismissSheet()
                }
            }
        }
    }

    /// The spiral is pushed from the map, never entered from a tab — a pass is
    /// not a destination without a node. `navigate` dismisses the drawer on the
    /// way, which is why there is no `onDismiss` dance left here.
    private func start() {
        navigator.navigate(to: .session(node))
    }

    /// Done phases are green, the current one carries the node's colour, later
    /// ones are inert here — jumping ahead is a desktop affordance the mobile
    /// design drops.
    private func row(_ phase: Phase, at index: Int, _ model: NodeDetailViewModel) -> some View {
        let done = model.current >= 0 && index < model.current
        let isCurrent = index == model.current
        let tint = done ? NodeState.mastered.color : (isCurrent ? model.state.color : Palette.inkGhost)
        return HStack(spacing: 12) {
            Text(done ? "✓" : isCurrent ? "→" : "·")
                .font(.atlas(.sans, 12))
                .foregroundStyle(tint)
                .frame(width: 24, height: 24)
                .background(isCurrent ? model.state.color.opacity(0.14) : .clear, in: .circle)
                .overlay { Circle().strokeBorder(done || isCurrent ? tint : Palette.hairlineStrong, lineWidth: 1) }
            Text(phase.rawValue)
                .font(.atlas(.serif, 15, weight: isCurrent ? .semibold : .regular))
                .foregroundStyle(done || isCurrent ? Palette.ink : Palette.inkGhost)
            Spacer(minLength: 0)
            if isCurrent { Kicker("próximo", tint: model.state.color) }
        }
        .frame(minHeight: 46)
        .padding(.horizontal, 4)
    }
}

/// Prerequisite chips wrap — there are two on one node and five on another.
struct FlowChips: View {
    private let items: [(String, NodeState)]
    init(_ items: [(String, NodeState)]) { self.items = items }
    var body: some View {
        // `Layout` for a row of chips is a lot of code for what a flexible grid
        // already does; a single flexible column wraps them the same way.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 7, alignment: .leading)],
                  alignment: .leading, spacing: 7) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                Chip(item.0, dot: item.1.color)
            }
        }
    }
}
