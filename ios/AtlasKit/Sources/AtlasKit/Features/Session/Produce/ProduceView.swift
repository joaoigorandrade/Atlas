import Navigation
import SwiftUI

/// "Produce" — say it, out loud, first try, no script.
///
/// The cue is in the learner's own language on purpose: reading a
/// target-language sentence aloud is not production, and a surface that shows
/// one has quietly become a pronunciation drill.
struct ProduceView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ProduceViewModel?
    @State private var speaking = false

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Preparando uma cena…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? ProduceViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        .onDisappear { model?.leave() }
        .sheet(isPresented: $speaking) {
            if let model {
                @Bindable var model = model
                VoiceSheet(
                    dictation: model.dictation,
                    tint: Phase.produce.tint,
                    text: $model.said,
                    placeholder: "Fale — de primeira, sem roteiro",
                    sendTitle: "Foi isso que eu disse",
                    busy: model.judging || !model.canSend,
                    escapes: [],
                    listen: { model.listen() },
                    send: { speaking = false; model.submit() },
                    keyboard: { speaking = false }
                )
                .presentationDetents([.height(VoiceSheet.height), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Palette.paper)
            }
        }
    }

    @ViewBuilder
    private func content(_ model: ProduceViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.produce, title: model.node.label, back: { navigator.pop() }) {
                if model.total > 0 {
                    Chip(verbatim: "\(min(model.session.index + 1, model.total))/\(model.total)",
                         tint: Palette.produceInk)
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let turn = model.current {
                    run(content, turn, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.produceInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - One turn

    private func run(
        _ content: ProduceContent, _ turn: ProduceTurn, _ model: ProduceViewModel
    ) -> some View {
        VStack(spacing: 0) {
            SegmentBar(model.rail, value: Text("\(model.score) de \(model.total)"))
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(Palette.paper)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 6) {
                        Kicker("A situação", tint: Palette.produceInk)
                        Text(verbatim: content.scene)
                            .font(.atlas(.sans, 14.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.produceBg, in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Palette.produceBorder, lineWidth: 1)
                    }

                    HStack {
                        Kicker("Diga isto", tint: Palette.produceInk)
                        Spacer()
                        Text(verbatim: "\(turn.seconds)s")
                            .font(.atlas(.mono, 12))
                            .foregroundStyle(Palette.inkFaint)
                    }
                    .padding(.top, 20)

                    Text(verbatim: turn.cue)
                        .font(.atlas(.serif, 20))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    if model.settled, let verdict = model.verdict {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Circle().fill(verdict.tint).frame(width: 8, height: 8)
                                Text(verdict.label)
                                    .font(.atlas(.mono, 11))
                                    .textCase(.uppercase)
                                    .kerning(1.2)
                                    .foregroundStyle(verdict.tint)
                            }
                            Text(verbatim: model.session.saidBy[turn.id] ?? "")
                                .font(.atlas(.sans, 14.5))
                                .foregroundStyle(Palette.inkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(verbatim: model.session.reads[turn.id] ?? "")
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.produceBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.produceBorder, lineWidth: 1)
                        }
                        .padding(.top, 18)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            Dock {
                if model.settled {
                    CTAButton("Próxima →", tint: Palette.produceInk) { model.next() }
                } else {
                    // The microphone is the phase, not a convenience beside a
                    // text box: this is the one rung that measures speaking.
                    CTAButton("Falar", tint: Palette.produceInk) { speaking = true }
                        .disabled(model.judging)
                }
            }
        }
    }

    // MARK: - The report

    private func report(_ content: ProduceContent, _ model: ProduceViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A fala", tint: Palette.produceInk)
                    Text(model.passed
                         ? "Você produziu ao vivo. É isso que significa ter a língua."
                         : "Algumas não saíram.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.total) falas saíram.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    // Avoidance is called out on its own. Every `thin` turn was
                    // comprehensible, so a plain score cannot see it — and being
                    // understood while going around the form is the habit that
                    // stalls a speaker for years.
                    if !model.avoided.isEmpty {
                        Text("Você contornou a forma em vez de atravessá-la — é esse o hábito que trava quem fala.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.turns) { turn in row(turn, model) }
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
            }
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.reported)
    }

    private func row(_ turn: ProduceTurn, _ model: ProduceViewModel) -> some View {
        let verdict = model.session.verdicts[turn.id]
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(verdict?.tint ?? Palette.inkFaint)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: turn.cue)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                // In words as well as in colour: a dot is invisible to VoiceOver
                // and indistinguishable to a colour-blind learner.
                if let verdict {
                    Text(verdict.label)
                        .font(.atlas(.sans, 12.5))
                        .foregroundStyle(verdict == .good ? Palette.inkFaint : verdict.tint)
                }
                if verdict != .good, let read = model.session.reads[turn.id] {
                    Text(verbatim: read)
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
    }
}
