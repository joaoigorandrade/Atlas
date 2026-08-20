import SwiftUI

/// "Crisol" (screen 18) — the transfer test, and the only path to green. A
/// problem in a framing the learner was never handed: if they memorised the
/// pattern instead of understanding it, this is where it shows.
///
/// A failure is the diagnostically rich outcome, not the wasted one — it names
/// the sub-concept that didn't carry over, hangs it under the node as a gap,
/// and offers a short re-explanation before a scaffolded re-attempt.
struct CrucibleView: View {
    let session: Session
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var content: CrucibleContent?
    /// [0] the novel transfer, [1] the scaffolded re-attempt.
    @State private var rung = 0
    @State private var work = ""
    @State private var hinted = false
    @State private var judging = false
    @State private var judgement: CrucibleJudgement?
    @State private var message = ""

    private var problem: CrucibleProblem? { content?.problems[safe: rung] }

    var body: some View {
        VStack(spacing: 0) {
            PhaseBar(.crucible, title: session.node.label, back: { dismiss() })

            if let judgement {
                diagnostic(judgement)
            } else if let problem {
                attempt(problem)
            } else {
                Waiting(message.isEmpty ? "Escrevendo um problema novo…" : message, spinning: message.isEmpty)
            }
        }
        .background(Palette.paper)
        .task { await load() }
    }

    // MARK: - The attempt

    private func attempt(_ problem: CrucibleProblem) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(rung == 0 ? "Um problema que você nunca viu" : "Mais uma vez, com apoio")
                        .font(.atlas(.serif, 26))
                        .foregroundStyle(Palette.ink)
                    Text(rung == 0
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

                    if hinted {
                        Text(problem.hint)
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .padding(.horizontal, 13).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Palette.amberBg, in: .rect(cornerRadius: 10))
                            .padding(.top, 12)
                    }

                    Kicker("Seu trabalho").padding(.top, 22)
                    AnswerEditor(text: $work, placeholder: problem.placeholder, tint: Palette.crucibleInk)
                        .padding(.top, 9)

                    if !message.isEmpty {
                        Text(message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk).padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }

            Dock {
                HStack(spacing: 10) {
                    CTAButton(judging ? "Lendo sua tentativa…" : "Enviar tentativa", tint: Palette.crucibleInk) {
                        Task { await submit(problem) }
                    }
                    .disabled(judging || work.trimmingCharacters(in: .whitespaces).isEmpty)
                    Button("Dica") { hinted = true }
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

    private func diagnostic(_ judgement: CrucibleJudgement) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(judgement.passed ? "Transferência confirmada" : "O que não atravessou",
                           tint: judgement.passed ? NodeState.mastered.color : Palette.crucibleInk, size: 11)
                    Text(judgement.passed
                         ? "\(session.node.label) atravessou para um enquadramento que você nunca viu. Isso é domínio."
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
                        Text(judgement.reExplain ?? content?.reExplain ?? "")
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
                if judgement.passed || rung >= (content?.problems.count ?? 0) - 1 {
                    CTAButton("Voltar ao mapa", tint: judgement.passed ? Palette.accent : Palette.crucibleInk) {
                        dismiss()
                    }
                } else {
                    CTAButton("Tentar de novo · um degrau abaixo", tint: Palette.crucibleInk) {
                        self.judgement = nil
                        rung += 1
                        work = ""
                        hinted = false
                    }
                }
            }
        }
    }

    // MARK: - Loading and judging

    private func load() async {
        var context = session.context
        context["masteredLabels"] = .array(session.learnedElsewhere.map { .string($0.label) })
        do {
            content = try await store.api.crucible(context)
        } catch {
            message = Onboarding.copy(for: error, doing: "escrever seu problema")
        }
    }

    /// The submission is the only write in the app that can turn a node green,
    /// and the only one that hangs a gap off a failure — both live in
    /// `Session.settleCrucible`, so the screen never touches the map itself.
    private func submit(_ problem: CrucibleProblem) async {
        guard !judging, let content else { return }
        judging = true
        defer { judging = false }
        var context = session.context
        context["problem"] = .string(problem.q)
        context["hint"] = .string(problem.hint)
        context["answer"] = .string(work)
        do {
            let verdict: CrucibleJudgement = try await store.api.judge("crucible", context)
            session.settleCrucible(verdict, gap: content.gap)
            judgement = verdict
        } catch {
            message = Onboarding.copy(for: error, doing: "avaliar sua tentativa")
        }
    }
}
