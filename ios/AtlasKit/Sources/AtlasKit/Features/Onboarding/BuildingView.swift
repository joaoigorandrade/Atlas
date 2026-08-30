import SwiftUI

/// Screen 6 — Montando. The map assembling behind a centred progress line.
/// The count is the honest signal: concepts placed, as they land.
struct BuildingView: View {
    let onboarding: OnboardingViewModel
    /// The wait is real, so the copy narrates work instead of stalling on one
    /// sentence — same four lines, same 1.4s, as `BuildingOverlay.tsx`.
    @State private var line = 0

    private let lines = [
        String(localized: "Explorando o território…"),
        String(localized: "Assentando as fundações…"),
        String(localized: "Mapeando os pré-requisitos…"),
        String(localized: "Acendendo a fronteira…"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            MapBackdrop(graph: onboarding.graph, states: onboarding.states)

            VStack(spacing: 0) {
                Kicker("Gerando seu mapa", size: 11)
                Text(verbatim: lines[line])
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
            // VoiceOver gets the count, which is the only honest signal here:
            // the bar is indeterminate and the numeric transition is visual.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: "\(lines[line]) \(count)"))
            .accessibilityAddTraits(.updatesFrequently)
        }
        .background(Palette.paper)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.4))
                withAnimation(Motion.standard) { line = (line + 1) % lines.count }
            }
        }
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
        // Derived once per redraw, not once per drawn frame: the map is
        // animating in behind screens 6 and 7 while it streams.
        let shown = displayStates(states, graph)
        let prepared = PreparedGraph(graph)
        GeometryReader { geo in
            Canvas { context, size in
                drawGraph(&context, prepared, shown, .fitting(graph, in: size, inset: 60),
                          viewport: size, labels: false)
            }
            .opacity(opacity)
            .animation(Motion.enter, value: graph.nodes.count)
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        // Decorative everywhere it is used: an unlabelled canvas of the map
        // behind the copy, which the copy already says out loud.
        .accessibilityHidden(true)
    }
}
