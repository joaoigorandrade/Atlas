import SwiftUI

/// Screens 7 and 8 — Direto ou perguntas, and Nivelamento. One screen in three
/// states, the way the design draws them: the fork over the faded new map, the
/// questions themselves, and the map-is-ready beat that ends onboarding.
struct PlacementView: View {
    let onboarding: OnboardingViewModel

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
                questions.transition(.opacity)
            } else {
                fork.transition(.opacity)
            }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: onboarding.takingPlacement)
        .animation(Motion.enter, value: onboarding.placementDone)
        // The screen changes under VoiceOver with focus wherever it was, and the
        // failure sentence lands below the copy with no focus change — neither
        // is reported unless it is said.
        .onChange(of: onboarding.message) { _, sentence in
            guard !sentence.isEmpty else { return }
            AccessibilityNotification.Announcement(sentence).post()
        }
    }

    // MARK: - Screen 7, and the same shape when the placement ends

    private var fork: some View {
        VStack(spacing: 0) {
            MapBackdrop(graph: onboarding.graph, states: onboarding.states, opacity: 0.65)

            VStack(alignment: .leading, spacing: 8) {
                Text("Seu mapa está pronto.")
                    .font(.atlas(.serif, 26))
                    .foregroundStyle(Palette.ink)
                Text(onboarding.forkBody)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.inkMuted)
                notice.padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.bottom, 22)

            Dock {
                if onboarding.placementDone {
                    CTAButton("Começar →", hero: true) { onboarding.finish() }
                } else {
                    // No first question means no test to offer: the map is the
                    // only way on, so it stops being the quiet second option.
                    if onboarding.placementUnavailable {
                        CTAButton("Ir para o mapa →", hero: true) { onboarding.finish() }
                    } else {
                        CTAButton("Testar meu conhecimento →", hero: true) { onboarding.takePlacement() }
                        GhostButton("Ir direto para o mapa") { onboarding.finish() }
                    }
                    // The stream died with concepts already on the map: what
                    // landed is usable, and rebuilding is the learner's call.
                    if onboarding.mapIncomplete {
                        GhostButton("Tentar de novo") { onboarding.buildMap() }
                    }
                }
            }
        }
        .onAppear { AccessibilityNotification.Announcement(String(localized: "Seu mapa está pronto.")).post() }
    }

    /// The failure sentence, wherever the learner is standing when it happens.
    /// It used to live only in `fork`, which is hidden for the whole placement —
    /// so a writer that stumbled at question 4 said nothing until one tap later,
    /// underneath "Seu mapa está pronto."
    @ViewBuilder private var notice: some View {
        if !onboarding.message.isEmpty {
            Text(verbatim: onboarding.message)
                .font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.amberInk)
        }
    }

    // MARK: - Screen 8, one question at a time

    private var questions: some View {
        VStack(spacing: 0) {
            SegmentBar(onboarding.rail)
                .accessibilityElement()
                .accessibilityLabel(onboarding.railLabel)
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 16)

            notice
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 12)

            if let question = onboarding.question {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header(question)
                        Text(verbatim: question.q)
                            .font(.atlas(.serif, 23))
                            .foregroundStyle(Palette.ink)
                            .padding(.vertical, 14)
                        options(question)
                        // What the question is actually probing — the model
                        // writes it on every call.
                        if !question.note.isEmpty {
                            Text(verbatim: question.note)
                                .font(.atlas(.sans, 13))
                                .foregroundStyle(Palette.inkFaint)
                                .padding(.top, 12)
                        }
                        if let kicker = onboarding.verdictKicker, let body = onboarding.verdictBody {
                            verdict(kicker, body).padding(.top, 22)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                }
            } else {
                // Answered faster than the writer could write: the next question
                // is real and on its way, it just isn't here yet.
                Waiting("Escrevendo a próxima pergunta…")
            }

            if onboarding.verdict != nil {
                Dock {
                    CTAButton(onboarding.noMoreQuestions ? "Ver seu mapa →" : "Próxima pergunta →") {
                        onboarding.next()
                    }
                }
                .transition(.move(edge: .bottom))
            }
        }
        // Grading is the beat of this screen: the marks land, the verdict slides
        // in under them, and the dock arrives to move on.
        .animation(Motion.standard, value: onboarding.verdict?.picked)
        .animation(Motion.standard, value: onboarding.answered)
        .sensoryFeedback(.selection, trigger: onboarding.verdict?.picked)
    }

    private func header(_ question: DiagnosticQuestion) -> some View {
        HStack(spacing: 10) {
            Text(verbatim: question.tag)
                .font(.atlas(.mono, 12))
                .foregroundStyle(Palette.amberInk)
            Spacer(minLength: 0)
            Text(question.difficulty.label)
                .textCase(.uppercase)
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
                ChoiceRow(option.label,
                          mark: mark(index, question),
                          chosen: chosen(index),
                          enabled: onboarding.verdict == nil) {
                    onboarding.answer(index)
                }
            }
        }
    }

    /// Green marks the answer, amber the miss that was picked. Everything else
    /// keeps its hairline — an option nobody chose says nothing.
    private func mark(_ index: Int, _ question: DiagnosticQuestion) -> ChoiceMark {
        guard onboarding.verdict != nil else { return .unmarked }
        if index == question.correctIndex { return .right }
        return chosen(index) ? .wrong : .unmarked
    }

    private func chosen(_ index: Int) -> Bool { onboarding.verdict?.picked == index }

    private func verdict(_ kicker: LocalizedStringKey, _ body: LocalizedStringKey) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(kicker, tint: onboarding.verdictTint, size: 12)
            Text(body)
                .font(.atlas(.sans, 14))
                .foregroundStyle(Palette.inkMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

}
