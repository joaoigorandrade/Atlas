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
    /// A phase tapped ahead of the one the node is owed, waiting on the nudge.
    @State private var pendingSkip: Phase?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear.frame(height: 1) }
        }
        .background(Palette.cardAlt)
        .task {
            if model == nil { model = NodeDetailViewModel(node: node, store: store) }
            // Opening the drawer is the clearest statement of intent there is:
            // whatever phase this node is owed is about to be started, so it is
            // written now rather than after the tap.
            if let kind = model?.owed?.kind { store.warmUp(kind, for: node) }
        }
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
                Text(verbatim: node.label)
                    .font(.atlas(.serif, 26))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 6)

                if let summary = node.summary {
                    Text(verbatim: summary)
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
                .animation(Motion.enter, value: pendingSkip)

                if let pendingSkip, let owed = model.owed {
                    nudge(skipping: owed, to: pendingSkip).padding(.top, 12)
                }

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
    private func start(_ phase: Phase? = nil) {
        navigator.navigate(to: .session(node, phase: phase))
    }

    /// Done phases are green, the current one carries the node's colour, later
    /// ones read as inert but still answer: tapping ahead asks first. Mirrors
    /// the web's phase list — every row of an unlocked node is a button.
    private func row(_ phase: Phase, at index: Int, _ model: NodeDetailViewModel) -> some View {
        let done = model.current >= 0 && index < model.current
        let isCurrent = index == model.current
        let tint = done ? NodeState.mastered.color : (isCurrent ? model.state.color : Palette.inkGhost)
        return HStack(spacing: 12) {
            Text(verbatim: done ? "✓" : isCurrent ? "→" : "·")
                .font(.atlas(.sans, 12))
                .foregroundStyle(tint)
                .frame(width: 24, height: 24)
                .background(isCurrent ? model.state.color.opacity(0.14) : .clear, in: .circle)
                .overlay { Circle().strokeBorder(done || isCurrent ? tint : Palette.hairlineStrong, lineWidth: 1) }
            Text(verbatim: phase.rawValue)
                .font(.atlas(.serif, 15, weight: isCurrent ? .semibold : .regular))
                .foregroundStyle(done || isCurrent ? Palette.ink : Palette.inkGhost)
            Spacer(minLength: 0)
            // How far into the reading, on the reading's own row — it stands in
            // for the "próximo" chip there, exactly as the web draws it.
            if index == 0, let reading = model.reading {
                Kicker(reading, tint: Palette.inkMuted)
            } else if isCurrent {
                Kicker("próximo", tint: model.state.color)
            } else if done {
                Kicker("refazer", tint: NodeState.mastered.color)
            }
        }
        .frame(minHeight: 46)
        .padding(.horizontal, 4)
        .contentShape(.rect)
        .onTapGesture {
            guard model.current >= 0 else { return }
            if index > model.current { pendingSkip = phase } else { open(phase) }
        }
    }

    /// The one way into a phase from this drawer. Retido is the review rather
    /// than a pass — the same fork `onPhaseAction` takes on the web.
    private func open(_ phase: Phase) {
        pendingSkip = nil
        if phase == .retained {
            navigator.dismissSheet()
            tabs.switchTab(to: .review)
        } else {
            start(phase)
        }
    }

    /// Tapping past the recommended phase is allowed — it is asked about once,
    /// naming what would be skipped, and the learner decides. `useSpiral`'s
    /// state bump on the way through is already `SessionViewModel`'s job.
    private func nudge(skipping owed: Phase, to target: Phase) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(owed.skipNudge)
                .font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.amberInk)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button { open(owed) } label: {
                    Text("Fazer \(owed.rawValue) primeiro")
                        .font(.atlas(.sans, 13, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .background(Palette.accent, in: .rect(cornerRadius: 9))
                }
                .pressable()
                Button { open(target) } label: {
                    Text("Pular para \(target.rawValue) →")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.amberInk)
                        .underline()
                        .padding(.vertical, 9)
                }
                .pressable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 15).padding(.vertical, 13)
        .background(Palette.amberBg, in: .rect(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.amberInk.opacity(0.25), lineWidth: 1) }
        .transition(.opacity.combined(with: .move(edge: .top)))
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
                Chip(verbatim: item.0, dot: item.1.color)
            }
        }
    }
}
