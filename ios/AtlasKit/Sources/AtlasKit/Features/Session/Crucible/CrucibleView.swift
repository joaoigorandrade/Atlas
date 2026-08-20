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
            if let model { content(model) } else { Waiting("Escrevendo um problema novo…") }
        }
        .background(Palette.paper)
        .task {
            let model = model ?? CrucibleViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: CrucibleViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.crucible, title: model.node.label, back: { navigator.pop() })

            if let judgement = model.judgement {
                diagnostic(judgement, model)
            } else if let problem = model.problem {
                attempt(problem, model)
            } else {
                Waiting(model.waitingCopy, spinning: model.message.isEmpty)
            }
        }
    }

    // MARK: - The attempt

    private func attempt(_ problem: CrucibleProblem, _ model: CrucibleViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(model.rung == 0 ? "Um problema que você nunca viu" : "Mais uma vez, com apoio")
                        .font(.atlas(.serif, 26))
                        .foregroundStyle(Palette.ink)
                    Text(model.rung == 0
                         ? "Contexto novo, de propósito. Se você só decorou o padrão, é aqui que aparece."
                         : "Mesmo conceito, um degrau abaixo — agora com o que faltou já nomeado.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 9) {
                        Kicker(problem.tag, tint: Palette.crucibleInk)
                        Text(problem.q).font(.atlas(.serif, 16.5)).lineSpacing(4).foregroundStyle(Palette.ink)
                    }
                    .padding(.horizontal, 20).padding(.vertical, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.crucibleBg, in: .rect(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.crucibleBorder, lineWidth: 1) }
                    .padding(.top, 22)

                    if model.hinted {
                        Text(problem.hint)
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .padding(.horizontal, 13).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Palette.amberBg, in: .rect(cornerRadius: 10))
                            .padding(.top, 12)
                    }

                    Kicker("Seu trabalho").padding(.top, 22)
                    AnswerEditor(text: $model.work, placeholder: problem.placeholder, tint: Palette.crucibleInk)
                        .padding(.top, 9)

                    if !model.message.isEmpty {
                        Text(model.message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk).padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }

            Dock {
                HStack(spacing: 10) {
                    CTAButton(model.judging ? "Lendo sua tentativa…" : "Enviar tentativa",
                              tint: Palette.crucibleInk) {
                        Task { await model.submit() }
                    }
                    .disabled(!model.canSubmit)
                    Button("Dica") { model.showHint() }
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.horizontal, 16)
                        .frame(minHeight: Metrics.cta)
                        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                }
            }
        }
    }

    // MARK: - The transfer diagnostic

    private func diagnostic(_ judgement: CrucibleJudgement, _ model: CrucibleViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(judgement.passed ? "Transferência confirmada" : "O que não atravessou",
                           tint: judgement.passed ? NodeState.mastered.color : Palette.crucibleInk, size: 11)
                    Text(judgement.passed
                         ? "\(model.node.label) atravessou para um enquadramento que você nunca viu. Isso é domínio."
                         : "Parte disso atravessou, parte não. O que ficou está no seu mapa agora — em vermelho, sob o conceito.")
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
                            Text(row.text).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 14)
                    }

                    if !judgement.passed {
                        Kicker("Em trinta segundos").padding(.top, 24)
                        Text(model.reExplanation)
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
                }
            }
        }
    }
}
