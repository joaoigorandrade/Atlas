import Navigation
import PencilKit
import SwiftUI

/// "Perform" — carry it out on this case, the way you would for real. Not
/// explaining the procedure (Feynman) and not reciting its steps, which is the
/// rehearsal a procedure most easily fakes.
struct PerformView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: PerformViewModel?
    @State private var drawingTab = false

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Montando um caso real…") }
        }
        .paper()
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
            // The brief scrolls on its own above the editor: with the figure,
            // the steps and the nudge it outgrows a phone, and the editor must
            // not sit inside a scroll (`AnswerEditor`'s `fills`).
            ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("O caso", tint: Palette.performInk)
                // The whole brief, with its real values. What is graded is what
                // each step produced *here*, so the case stays on screen while
                // the work is written.
                Text(verbatim: content.task)
                    .font(.atlas(.serif, 19))
                    .lineSpacing(5)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)

                ExampleImage(task: content.task).id(content.task).padding(.top, 12)

                if !model.previous.isEmpty {
                    Text("Um caso novo. A última execução quebrou em: \(model.previous.joined(separator: " · ")).")
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.inkSoft)
                        .padding(.top, 8)
                }

                if !model.fixing.isEmpty {
                    Text("Corrija o que quebrou e envie de novo: \(model.fixing.joined(separator: " · ")).")
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.amberInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }

                // A first run shows the step names (never their results);
                // re-runs hide them.
                if !model.rerunning {
                    VStack(alignment: .leading, spacing: 4) {
                        Kicker("Os passos", tint: Palette.performInk)
                        ForEach(Array(content.steps.enumerated()), id: \.element.id) { i, step in
                            Text(verbatim: "\(i + 1). \(step.step)")
                                .font(.atlas(.serif, 15))
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, 14)
                }

                if model.nudged {
                    Text(verbatim: content.scaffold)
                        .font(.atlas(.serif, 15.5))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .boxed(Palette.performBg, border: Palette.performBorder, radius: Metrics.panelRadius)
                        .padding(.top, 14)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 18)
            .padding(.bottom, 8)
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(alignment: .leading, spacing: 0) {
                // Write or draw — both go to the checker; switching clears neither.
                Picker("Sua execução", selection: $drawingTab) {
                    Text("Escrever").tag(false)
                    Text("Desenhar").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 10)

                if drawingTab {
                    SketchCanvas(drawing: $model.drawing)
                        .frame(height: 260)
                        .boxed(Palette.card, border: Palette.hairlineStrong, radius: Metrics.panelRadius)
                        .overlay(alignment: .bottomTrailing) {
                            if !model.drawing.strokes.isEmpty {
                                GhostButton("Limpar") { model.drawing = PKDrawing() }
                                    .fixedSize()
                                    .padding(6)
                            }
                        }
                } else {
                    AnswerEditor(text: $model.work,
                                 placeholder: String(localized: "Resolva — mostre cada passo e o que ele produz…"),
                                 dictation: model.dictation, minHeight: 150, tint: Palette.performInk)
                        // `TextEditor` takes every point it is offered; the brief
                        // above is what the learner reads while writing.
                        .frame(maxHeight: 220)
                }

                if !model.message.isEmpty {
                    Text(verbatim: model.message)
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.amberInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
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
                        .font(.atlas(.display, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    // The two failures, said apart — and only on a run that
                    // failed: a pass may leave a step or two out.
                    if !model.passed, !model.pending {
                        Text(model.broken.isEmpty
                             ? "Falta muito da execução."
                             : "A execução quebra num passo. Resultado errado é passo falhado.")
                            .font(.atlas(.serif, 15))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                        if model.broken.isEmpty, !model.skipped.isEmpty {
                            Text(verbatim: model.skipped.map(\.step).joined(separator: " · "))
                                .font(.atlas(.serif, 14))
                                .foregroundStyle(Palette.inkGhost)
                                .padding(.top, 4)
                        }
                    }
                    // The verdicts land first; the checker's comment types in
                    // under them (the web's `StreamingText`).
                    if model.pending || !model.response.isEmpty {
                        Group {
                            if model.response.isEmpty {
                                AtlasPulse(tint: Palette.performInk)
                            } else {
                                Text(verbatim: model.response)
                                    .font(.atlas(.serif, 16.5))
                                    .lineSpacing(5)
                                    .foregroundStyle(Palette.inkSoft)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .boxed(Palette.performBg, border: Palette.performBorder, radius: Metrics.panelRadius)
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
            // A failed run leads with fixing or re-running: staying on the case
            // is the move, leaving the alternative. Nothing is pressable until
            // the checker has finished its read.
            Dock {
                if model.passed {
                    CTAButton(model.handOffLabel, tint: model.handOffTint) { model.advance() }
                    GhostButton("Executar de novo") { model.rerun() }
                } else {
                    CTAButton(model.canFix ? "Corrigir neste caso →" : "Executar de novo →",
                              tint: Palette.performInk) { model.canFix ? model.fix() : model.rerun() }
                    GhostButton(model.handOffLabel) { model.advance() }
                }
            }
            .disabled(model.pending)
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.pending == false && model.reported)
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
                        .font(.atlas(.serif, 15.5))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    // Which steps the gate actually leans on. A run can omit a
                    // sanity check and still be a run; it cannot omit this.
                    if step.loadBearing {
                        Text("essencial")
                            .font(.atlas(.caps, 11.5))
                            .tracking(1.6)
                            .textCase(.uppercase)
                            .foregroundStyle(Palette.performInk)
                    }
                }
                Text(verbatim: verdict.label)
                    .font(.atlas(.serif, 14))
                    .foregroundStyle(verdict == .good ? Palette.inkFaint : Palette.amberInk)
                if let quote = model.quote(step) {
                    Text(verbatim: "“\(quote)”")
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
    }
}
