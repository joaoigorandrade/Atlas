import SwiftUI

/// Screen 6 — Montando. The map assembling behind a centred progress line.
/// The count is the honest signal: concepts placed, as they land.
struct BuildingView: View {
    let onboarding: OnboardingViewModel

    var body: some View {
        VStack(spacing: 0) {
            MapBackdrop(graph: onboarding.graph, states: onboarding.states)

            VStack(spacing: 0) {
                Kicker("Gerando seu mapa", size: 11)
                Text("Mapeando os pré-requisitos…")
                    .font(.atlas(.serif, 24))
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .padding(.top, 10)
                    .padding(.bottom, 20)
                // Indeterminate on purpose: the map's length isn't known until
                // it ends, and a bar that pretends otherwise stalls at 90%.
                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(Palette.accent)
                    .frame(maxWidth: 260)
                Text(verbatim: count)
                    .font(.atlas(.mono, 11))
                    .tracking(0.9)
                    .foregroundStyle(Palette.inkGhost)
                    .padding(.top, 14)
                    .contentTransition(.numericText())
                    .animation(Motion.standard, value: onboarding.graph.nodes.count)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 56)
        }
        .background(Palette.paper)
    }

    /// Plural agreement belongs to the catalogue, not to an inline ternary —
    /// the two languages don't pluralise on the same rule.
    private var count: String {
        let placed = onboarding.graph.nodes.count
        return placed == 0
            ? String(localized: "lendo o tema…")
            : String(localized: "\(placed) conceitos posicionados")
    }
}

/// The territory, faded, behind screens 6 and 7. It fits itself to whatever has
/// landed so far, so the map grows in place instead of jumping a column at a time.
struct MapBackdrop: View {
    let graph: ConceptGraph
    var states: StateMap = [:]
    var opacity: Double = 0.55

    var body: some View {
        GeometryReader { geo in
            Canvas { context, size in
                drawGraph(
                    &context, graph, displayStates(states, graph),
                    .fitting(graph, in: size, inset: 60),
                    labels: false
                )
            }
            .opacity(opacity)
            .animation(Motion.enter, value: graph.nodes.count)
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}
