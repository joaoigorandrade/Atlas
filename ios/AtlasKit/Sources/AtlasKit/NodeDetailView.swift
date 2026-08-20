import SwiftUI

/// "Detalhe do nó" — the desktop drawer as a bottom sheet: what state the node
/// is in, what it is, where it sits in the spiral, and the one action to take.
struct NodeDetailView: View {
    let node: ConceptNode
    /// Starting a phase closes the sheet and hands the node back to the map,
    /// which is what presents the session over itself.
    let start: (ConceptNode) -> Void
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private var state: NodeState { store.display[node.id] ?? .unknown }
    /// A real review behind the node is what completes the spiral — being
    /// Mastered alone leaves Retido still owed.
    private var current: Int { phaseIndex(state, reviewed: store.reviewed.contains(node.id)) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 10) {
                        Circle().fill(state.color).frame(width: 11, height: 11)
                            .shadow(color: state.color, radius: 3.5)
                        Kicker(headline, tint: state.color, size: 11)
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
                            .clipShape(.rect(cornerRadius: 9))
                            .overlay(alignment: .leading) { Rectangle().fill(state.color).frame(width: 3) }
                            .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(Palette.hairline, lineWidth: 1) }
                            .clipShape(.rect(cornerRadius: 9))
                            .padding(.top, 14)
                    }

                    Kicker("Espiral de fases").padding(.top, 22)
                    VStack(spacing: 2) { ForEach(Array(Phase.allCases.enumerated()), id: \.element) { row($1, at: $0) } }
                        .padding(.top, 10)

                    let prereqs = store.graph.prerequisites(of: node.id)
                    if !prereqs.isEmpty {
                        Kicker("Pré-requisitos").padding(.top, 20)
                        FlowChips(prereqs.map { ($0.label, store.display[$0.id] ?? .unknown) })
                            .padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }

            Dock {
                CTAButton(current >= 0 ? "Começar · \(Phase.allCases[current].rawValue)" : "Bloqueado",
                          tint: current >= 0 ? Phase.allCases[max(0, current)].tint : Palette.inkGhost) {
                    dismiss()
                    start(node)
                }
                .disabled(current < 0)
                GhostButton("Já sei isso — pular") {
                    store.states[node.id] = .mastered
                    dismiss()
                }
            }
        }
        .background(Palette.cardAlt)
    }

    private var headline: String {
        switch state {
        case .frontier: "Fronteira · pronto"
        case .learning: "Aprendendo"
        case .shaky: "Instável · revisar"
        case .mastered: "Dominado"
        case .gap: "Lacuna"
        case .unknown: "Bloqueado"
        }
    }

    /// Done phases are green, the current one carries the node's colour, later
    /// ones are inert here — jumping ahead is a desktop affordance the mobile
    /// design drops.
    private func row(_ phase: Phase, at index: Int) -> some View {
        let done = current >= 0 && index < current
        let isCurrent = index == current
        let tint = done ? NodeState.mastered.color : (isCurrent ? state.color : Palette.inkGhost)
        return HStack(spacing: 12) {
            Text(done ? "✓" : isCurrent ? "→" : "·")
                .font(.atlas(.sans, 12))
                .foregroundStyle(tint)
                .frame(width: 24, height: 24)
                .background(isCurrent ? state.color.opacity(0.14) : .clear, in: .circle)
                .overlay { Circle().strokeBorder(done || isCurrent ? tint : Palette.hairlineStrong, lineWidth: 1) }
            Text(phase.rawValue)
                .font(.atlas(.serif, 15, weight: isCurrent ? .semibold : .regular))
                .foregroundStyle(done || isCurrent ? Palette.ink : Palette.inkGhost)
            Spacer(minLength: 0)
            if isCurrent { Kicker("próximo", tint: state.color) }
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
        // `Layout` for a row of chips is a lot of code for what a flexible
        // grid already does; a single flexible column wraps them the same way.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 7, alignment: .leading)],
                  alignment: .leading, spacing: 7) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                Chip(item.0, dot: item.1.color)
            }
        }
    }
}
