import Navigation
import SwiftUI

/// "Perform" — carry it out on this case, the way you would for real. Not
/// explaining the procedure (Feynman) and not reciting its steps, which is the
/// rehearsal a procedure most easily fakes.
struct PerformView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: PerformViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Montando um caso real…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? PerformViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        .onDisappear { model?.leave() }
    }

    @ViewBuilder
    private func content(_ model: PerformViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.perform, title: model.node.label, back: { navigator.pop() })
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity.combined(with: .move(edge: .bottom)))
                } else {
                    run(content, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.performInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.enter, value: model.reported)
    }

    // MARK: - The run

    private func run(_ content: PerformContent, _ model: PerformViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("O caso", tint: Palette.performInk)
                // The whole brief, with its real values. What is graded is what
                // each step produced *here*, so the case stays on screen while
                // the work is written.
                Text(verbatim: content.task)
                    .font(.atlas(.serif, 18))
                    .lineSpacing(5)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)

                if model.nudged {
                    Text(verbatim: content.scaffold)
                        .font(.atlas(.sans, 14))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.performBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.performBorder, lineWidth: 1)
                        }
                        .padding(.top, 14)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                AnswerEditor(text: $model.work,
                             placeholder: String(localized: "Resolva — mostre cada passo e o que ele produz…"),
                             dictation: model.dictation, fills: true, tint: Palette.performInk)
                    .padding(.top, 16)

                if !model.message.isEmpty {
                    Text(verbatim: model.message)
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.amberInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 18)
            .padding(.bottom, 12)

            Dock {
                CTAButton(model.judging ? "Conferindo sua execução…" : "Entregar a execução →",
                          tint: Palette.performInk) { model.submit() }
                    .disabled(!model.canSubmit)
                if !model.nudged {
                    GhostButton("Estou travado · um empurrão") { model.nudge() }
                }
            }
        }
    }

    // MARK: - The run report

    private func report(_ content: PerformContent, _ model: PerformViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A execução", tint: Palette.performInk)
                    Text(model.passed
                         ? "Executado em condições reais — o procedimento é seu."
                         : "A execução não fecha neste caso.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    // The two failures, said apart. A wrong result is a failed
                    // run of that step; a load-bearing step nobody carried out
                    // is a run that never happened.
                    if !model.broken.isEmpty {
                        Text("A execução quebra num passo. Resultado errado é passo falhado.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                    } else if !model.skipped.isEmpty {
                        Text("Um passo essencial não chegou a ser executado.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                    }
                    if !model.response.isEmpty {
                        Text(verbatim: model.response)
                            .font(.atlas(.serif, 15.5))
                            .lineSpacing(5)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 16)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.steps) { row($0, model) }
                    }
                    .padding(.top, 20)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton(model.handOffLabel, tint: model.handOffTint) { model.advance() }
                GhostButton("Executar de novo") { model.rerun() }
            }
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.reported)
    }

    private func row(_ step: PerformStep, _ model: PerformViewModel) -> some View {
        let verdict = model.verdict(step)
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(verdict.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(verbatim: step.step)
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    // Which steps the gate actually leans on. A run can omit a
                    // sanity check and still be a run; it cannot omit this.
                    if step.loadBearing {
                        Text("essencial")
                            .font(.atlas(.mono, 10))
                            .tracking(1.6)
                            .textCase(.uppercase)
                            .foregroundStyle(Palette.performInk)
                    }
                }
                Text(verbatim: verdict.label)
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(verdict == .good ? Palette.inkFaint : Palette.amberInk)
                if let quote = model.quote(step) {
                    Text(verbatim: "“\(quote)”")
                        .font(.atlas(.serif, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
    }
}
