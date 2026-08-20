import SwiftUI

/// Screens 7 and 8 — Direto ou perguntas, and Nivelamento. One screen in three
/// states, the way the design draws them: the fork over the faded new map, the
/// questions themselves, and the map-is-ready beat that ends onboarding.
struct PlacementView: View {
    let onboarding: Onboarding

    var body: some View {
        VStack(spacing: 0) {
            TopBar {
                Kicker("Nivelamento · adaptativo", size: 11)
            } trailing: {
                if onboarding.takingPlacement && !onboarding.placementDone {
                    Button("Pular") { onboarding.finish() }
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkFaint)
                        .frame(minHeight: Metrics.tap)
                }
            }

            if onboarding.takingPlacement && !onboarding.placementDone {
                questions
            } else {
                fork
            }
        }
        .background(Palette.paper)
    }

    // MARK: - Screen 7, and the same shape when the placement ends

    private var fork: some View {
        VStack(spacing: 0) {
            MapBackdrop(graph: onboarding.graph, states: onboarding.states, opacity: 0.65)

            VStack(alignment: .leading, spacing: 8) {
                Text("Seu mapa está pronto.")
                    .font(.atlas(.serif, 26))
                    .foregroundStyle(Palette.ink)
                Text(onboarding.placementDone
                     ? "Podamos o que você já domina e acendemos sua fronteira — os conceitos que você está pronto para aprender agora."
                     : "Quer um nivelamento rápido antes? \(diagnosticCount) perguntas adaptativas podam o que você já sabe e acendem sua fronteira real. Opcional — você pode ir direto.")
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.inkMuted)
                if !onboarding.message.isEmpty {
                    Text(onboarding.message)
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.amberInk)
                        .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.bottom, 22)

            Dock {
                if onboarding.placementDone {
                    CTAButton("Começar →", hero: true) { onboarding.finish() }
                } else {
                    CTAButton("Testar meu conhecimento →", hero: true) { onboarding.takePlacement() }
                    GhostButton("Ir direto para o mapa") { onboarding.finish() }
                }
            }
        }
    }

    // MARK: - Screen 8, one question at a time

    private var questions: some View {
        VStack(spacing: 0) {
            SegmentBar((0..<onboarding.total).map { $0 < onboarding.answered ? Palette.accent : nil })
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 16)

            if let question = onboarding.question {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header(question)
                        Text(question.q)
                            .font(.atlas(.serif, 23))
                            .foregroundStyle(Palette.ink)
                            .padding(.vertical, 14)
                        options(question)
                        if let verdict = onboarding.verdict { self.verdict(verdict).padding(.top, 22) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                }
            } else {
                // Answered faster than the writer could write: the next question
                // is real and on its way, it just isn't here yet.
                VStack(spacing: 10) {
                    ProgressView().tint(Palette.inkFaint)
                    Text("Escrevendo a próxima pergunta…")
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            if onboarding.verdict != nil {
                Dock {
                    CTAButton(onboarding.answered >= onboarding.total ? "Ver seu mapa →" : "Próxima pergunta →") {
                        onboarding.next()
                    }
                }
            }
        }
    }

    private func header(_ question: DiagnosticQuestion) -> some View {
        HStack(spacing: 10) {
            Text(question.tag)
                .font(.atlas(.mono, 12))
                .foregroundStyle(Palette.amberInk)
            Spacer(minLength: 0)
            Text(question.difficulty.label.uppercased())
                .font(.atlas(.mono, 10.5))
                .tracking(0.6)
                .foregroundStyle(Palette.inkGhost)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.hairline, lineWidth: 1) }
        }
    }

    private func options(_ question: DiagnosticQuestion) -> some View {
        VStack(spacing: 10) {
            ForEach(Array(question.opts.enumerated()), id: \.offset) { index, option in
                Button { onboarding.answer(index) } label: {
                    HStack(spacing: 12) {
                        Circle()
                            .strokeBorder(tint(index, question) ?? Palette.hairlineStrong, lineWidth: 1.5)
                            .background(Circle().fill(chosen(index) ? tint(index, question) ?? .clear : .clear))
                            .frame(width: 16, height: 16)
                        Text(option.label)
                            .font(.atlas(.sans, 15))
                            .foregroundStyle(Palette.ink)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                }
                .background(fill(index, question), in: .rect(cornerRadius: 11))
                .overlay {
                    RoundedRectangle(cornerRadius: 11)
                        .strokeBorder(tint(index, question) ?? Palette.hairlineStrong, lineWidth: 1)
                }
                // Once answered, the options that carried no verdict step back.
                .opacity(onboarding.verdict == nil || tint(index, question) != nil ? 1 : 0.5)
                .disabled(onboarding.verdict != nil)
            }
        }
    }

    /// Green marks the answer, amber the miss that was picked. Everything else
    /// keeps its hairline — an option nobody chose says nothing.
    private func tint(_ index: Int, _ question: DiagnosticQuestion) -> Color? {
        guard onboarding.verdict != nil else { return nil }
        if index == question.correctIndex { return Palette.accent }
        return chosen(index) ? Palette.amberInk : nil
    }

    private func fill(_ index: Int, _ question: DiagnosticQuestion) -> Color {
        guard let tint = tint(index, question) else { return Palette.card }
        return tint == Palette.accent ? Palette.successBg : Palette.amberBg
    }

    private func chosen(_ index: Int) -> Bool { onboarding.verdict?.picked == index }

    /// The truth about what was written to the map — a discounted slip pruned
    /// the concept rather than adding to it, and saying otherwise describes a
    /// map the learner doesn't have.
    private func verdict(_ verdict: Verdict) -> some View {
        let tag = verdict.question.tag
        // A malformed `correctIndex` is the model's mistake, not the learner's:
        // say the rest and leave the answer out rather than trapping.
        let answer = verdict.question.opts[safe: verdict.question.correctIndex]?.label ?? ""
        return VStack(alignment: .leading, spacing: 6) {
            Kicker(verdict.correct ? "Correto" : (verdict.slipped ? "Quase lá — contado como escorregão" : "Quase lá"),
                   tint: verdict.correct ? Palette.accent : Palette.amberInk, size: 12)
            Text(verdict.correct
                 ? "\(tag) e tudo abaixo dele foi marcado como sabido."
                 : verdict.slipped
                    ? "A resposta: \(answer)\nVocê acertou perguntas mais difíceis, então \(tag) continua marcado como sabido — nada foi adicionado ao seu mapa."
                    : "A resposta: \(answer)\nVamos encaixar \(tag) no seu mapa.")
                .font(.atlas(.sans, 14))
                .foregroundStyle(Palette.inkMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private typealias Verdict = Onboarding.Verdict
}
