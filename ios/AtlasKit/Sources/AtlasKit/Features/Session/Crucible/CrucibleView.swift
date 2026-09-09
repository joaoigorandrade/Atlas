import Navigation
import SwiftUI

/// "Crisol" (screen 18) — the transfer test, and the only path to green. A
/// problem in a framing the learner was never handed: if they memorised the
/// pattern instead of understanding it, this is where it shows.
struct CrucibleView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: CrucibleViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Escrevendo um problema novo…") }
        }
        .background(Palette.paper)
        // The wait and the pass are one screen arriving, not two screens
        // swapping: the shape fades out under the prose that lands over it.
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? CrucibleViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        // A verdict that lands after the learner has walked away rewrites the
        // map with no report and no explanation.
        .onDisappear { model?.leave() }
    }

    // MARK: - The confidence tap

    /// The reading this phase is built on, so it is asked as a scale and not as
    /// three identical crimson CTAs stacked in a dock over an empty page. Each
    /// row says what the level actually means and carries its own weight.
    private func confidence(_ model: CrucibleViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Antes de ver o problema")
                    .font(.atlas(.serif, 26))
                    .foregroundStyle(Palette.ink)
                Text("Quanto você confia que consegue usar \(model.node.label) em um contexto novo?")
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.inkMuted)
                    .padding(.top, 8)
                Text("Responda antes de ver o problema — depois dele a resposta já não mede nada. O Crisol compara o que você sentiu com o que aconteceu.")
                    .font(.atlas(.sans, 13))
                    .foregroundStyle(Palette.inkFaint)
                    .padding(.top, 10)

                ForEach(Array(CrucibleViewModel.Confidence.allCases.enumerated()), id: \.element.id) { index, level in
                    Button { model.state(level) } label: { row(level, weight: index + 1) }
                        .buttonStyle(.plain)
                        .pressable()
                        .padding(.top, index == 0 ? 22 : 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 20)
            .padding(.bottom, 28)
        }
    }

    /// One rung of the confidence scale: the claim, what it commits to, and
    /// three bars that make the ordering visible rather than implied.
    private func row(_ level: CrucibleViewModel.Confidence, weight: Int) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(level.label)
                    .font(.atlas(.serif, 16.5, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                Text(level.note)
                    .font(.atlas(.sans, 13))
                    .foregroundStyle(Palette.inkMuted)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 3) {
                ForEach(1...3, id: \.self) { bar in
                    Capsule()
                        .fill(bar <= weight ? Palette.crucibleInk : Palette.hairlineStrong)
                        .frame(width: 4, height: CGFloat(6 + bar * 5))
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
        .frame(minHeight: Metrics.tap, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.crucibleBorder, lineWidth: 1) }
        .contentShape(.rect)
    }

    @ViewBuilder
    private func content(_ model: CrucibleViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.crucible, title: model.node.label, back: { navigator.pop() })

            if let judgement = model.judgement {
                diagnostic(judgement, model)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if let problem = model.problem {
                if model.stage == .confidence {
                    // Before the problem is revealed, or it measures nothing:
                    // this tap is the whole calibration hook for the phase.
                    confidence(model).transition(.opacity)
                } else {
                    attempt(problem, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock { CTAButton("Tentar de novo", tint: Palette.crucibleInk) { Task { await model.retryLoad() } } }
                }
            }
        }
        // The verdict is the one moment in the spiral that changes the map's
        // colour — it earns the slow curve, and the haptic that goes with it.
        .animation(Motion.enter, value: model.judgement?.passed)
        .animation(Motion.standard, value: model.rung)
        .sensoryFeedback(model.judgement?.passed == true ? .success : .warning,
                         trigger: model.judgement?.passed)
    }

    // MARK: - The attempt

    private func attempt(_ problem: CrucibleProblem, _ model: CrucibleViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Which rung, and what they claimed on the way in. Neither
                    // was on screen before: the learner could not tell a first
                    // transfer from a scaffolded re-attempt while working one.
                    HStack(spacing: 10) {
                        Kicker("Tentativa \(model.rung + 1) de \(model.rungs)", tint: Palette.crucibleInk)
                        Spacer(minLength: 0)
                        if let confidence = model.confidence {
                            Chip(confidence.label, dot: Palette.crucibleInk)
                        }
                    }

                    Text(model.rung == 0 ? "Um problema que você nunca viu" : "Mais uma vez, com apoio")
                        .font(.atlas(.serif, 26))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 12)
                    Text(model.rung == 0
                         ? "Contexto novo, de propósito. Se você só decorou o padrão, é aqui que aparece."
                         : "Mesmo conceito, um degrau abaixo — agora com o que faltou já nomeado.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    // The promise the line above makes, kept. The gap and the
                    // re-explanation used to vanish with the report the moment
                    // the learner tapped through to this rung.
                    if let missing = model.missing {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("O que faltou", tint: NodeState.gap.color)
                            Text(verbatim: missing.label)
                                .font(.atlas(.serif, 15.5, weight: .semibold))
                                .foregroundStyle(Palette.ink)
                            if !missing.reExplain.isEmpty {
                                Text(verbatim: missing.reExplain)
                                    .font(.atlas(.sans, 13.5))
                                    .lineSpacing(3)
                                    .foregroundStyle(Palette.inkSoft)
                            }
                        }
                        .padding(.horizontal, 15).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.card, in: .rect(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                        .padding(.top, 18)
                    }

                    VStack(alignment: .leading, spacing: 9) {
                        Kicker(verbatim: problem.tag, tint: Palette.crucibleInk)
                        Text(verbatim: problem.q).font(.atlas(.serif, 16.5)).lineSpacing(4).foregroundStyle(Palette.ink)
                    }
                    .padding(.horizontal, 20).padding(.vertical, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.crucibleBg, in: .rect(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.crucibleBorder, lineWidth: 1) }
                    .padding(.top, 22)

                    // Beside the problem, not beside Submit: the hint reframes
                    // the problem, and in the dock its two labels were different
                    // widths, so revealing it resized the CTA next to it.
                    GhostButton(model.hinted ? "Esconder dica" : "Dica · o enquadramento, sem a resposta") {
                        model.toggleHint()
                    }
                    .padding(.top, 12)

                    if model.hinted {
                        Text(verbatim: problem.hint)
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .padding(.horizontal, 13).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Palette.amberBg, in: .rect(cornerRadius: 10))
                            .padding(.top, 10)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    Kicker("Seu trabalho").padding(.top, 22)
                    AnswerEditor(text: $model.work, placeholder: problem.placeholder,
                                 dictation: model.dictation, tint: Palette.crucibleInk)
                        .padding(.top, 9)

                    if !model.message.isEmpty {
                        Text(verbatim: model.message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk).padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            .animation(Motion.standard, value: model.hinted)

            Dock {
                // The judge is the longest wait in the app. A dimmed pill that
                // only changed its words read as a dead button for twenty-odd
                // seconds; the same pulse every other wait uses says it is alive.
                if model.judging {
                    HStack(spacing: 9) {
                        AtlasPulse(size: 15)
                        Text("Lendo sua tentativa — isso leva alguns segundos.")
                            .font(.atlas(.sans, 13))
                            .foregroundStyle(Palette.inkMuted)
                        Spacer(minLength: 0)
                    }
                }
                CTAButton(model.judging ? "Lendo sua tentativa…" : "Enviar tentativa",
                          tint: Palette.crucibleInk) {
                    model.dictation.flush()
                    model.submit()
                }
                .disabled(!model.canSubmit)
            }
            .animation(Motion.standard, value: model.judging)
        }
    }

    // MARK: - The transfer diagnostic

    private func diagnostic(_ judgement: CrucibleJudgement, _ model: CrucibleViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(judgement.passed ? "Transferência confirmada" : "O que não atravessou",
                           tint: judgement.passed ? NodeState.mastered.color : Palette.crucibleInk, size: 11)
                    // Rung-aware: the scaffolded problem is the one the learner
                    // was walked into, so a pass on it is not "a framing you
                    // have never seen".
                    Text(verbatim: model.verdictHeadline)
                        .font(.atlas(.serif, 19))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 12)

                    ForEach(Array(judgement.transfer.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 11) {
                            Circle()
                                .fill(row.verdict == "good" ? NodeState.mastered.color : NodeState.gap.color)
                                .frame(width: 8, height: 8)
                                .padding(.top, 6)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(verbatim: row.text).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                                // The dot's colour was the only thing saying
                                // whether this one carried over.
                                Text(verbatim: CrucibleViewModel.transferLabel(row.verdict))
                                    .font(.atlas(.mono, 10.5))
                                    .tracking(0.8)
                                    .foregroundStyle(row.verdict == "good" ? NodeState.mastered.color : NodeState.gap.color)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 14)
                        .accessibilityElement(children: .combine)
                    }

                    if !model.hintNote.isEmpty {
                        Text(verbatim: model.hintNote)
                            .font(.atlas(.sans, 13.5))
                            .lineSpacing(3)
                            .foregroundStyle(Palette.amberInk)
                            .padding(.horizontal, 13).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Palette.amberBg, in: .rect(cornerRadius: 10))
                            .padding(.top, 20)
                    }

                    if !model.calibration.isEmpty {
                        Kicker("Confiança × resultado").padding(.top, 24)
                        Text(verbatim: model.calibration)
                            .font(.atlas(.sans, 14))
                            .lineSpacing(3)
                            .foregroundStyle(Palette.inkSoft)
                            .padding(.top, 10)
                    }

                    if !judgement.passed {
                        Kicker("Em trinta segundos").padding(.top, 24)
                        Text(verbatim: model.reExplanation)
                            .font(.atlas(.serif, 16.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.ink)
                            .padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 22)
            }

            Dock {
                if model.isSettled {
                    CTAButton("Voltar ao mapa", tint: judgement.passed ? Palette.accent : Palette.crucibleInk) {
                        navigator.pop()
                    }
                } else {
                    CTAButton("Tentar de novo · um degrau abaixo", tint: Palette.crucibleInk) { model.retry() }
                    // A failed transfer already wrote the gap to the map. The
                    // dock's one button made the second rung look compulsory,
                    // and the only way out was the chevron in the top bar.
                    GhostButton("Voltar ao mapa · continuar depois") { navigator.pop() }
                }
            }
        }
    }
}
