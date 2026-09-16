import Navigation
import SwiftUI

/// "Drill" — the same call, made without stopping to derive it. The only rung
/// that measures how long an answer took, which is the whole reason it exists.
struct DrillView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: DrillViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Escrevendo as repetições…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? DrillViewModel(session: session)
            self.model = model
            await model.load()
        }
        .onDisappear { model?.leave() }
    }

    @ViewBuilder
    private func content(_ model: DrillViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.drill, title: model.node.label, back: { navigator.pop() }) {
                if model.content != nil && !model.reported {
                    // The clock is the phase. It reads out loud as well as on
                    // screen, because a learner using VoiceOver is being timed
                    // the same way.
                    Text(verbatim: "\(model.clock)s")
                        .font(.atlas(.mono, 15))
                        .foregroundStyle(model.clockTint)
                        .monospacedDigit()
                        .accessibilityLabel("Tempo nesta repetição")
                        .accessibilityValue(Text(verbatim: "\(model.clock)s"))
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let rep = model.current {
                    run(rep, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.drillInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - One rep

    private func run(_ rep: DrillRep, _ model: DrillViewModel) -> some View {
        VStack(spacing: 0) {
            SegmentBar(model.rail, value: Text("\(model.score) de \(model.total)"))
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 12)
                // The rail sits directly above a scroll, so it needs a ground of
                // its own: without one the prose passing under it is composited
                // straight through the gaps between the capsules, which reads as
                // a rendering fault rather than as scrolling. The gap below keeps
                // the first line from being sheared off flush (ConsumeView §rail).
                .padding(.bottom, 8)
                .background(Palette.paper)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // No context and no setup: a drill item is its prompt and
                    // nothing else. Anything above it is something to read
                    // instead of something to know.
                    Text(verbatim: rep.prompt)
                        .font(.atlas(.serif, 24))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 22)

                    VStack(spacing: 8) {
                        ForEach(Array(rep.answers.enumerated()), id: \.offset) { index, answer in
                            ChoiceRow(answer, mark: model.mark(index),
                                      chosen: model.hit == index,
                                      enabled: !model.settled) { model.answer(index) }
                        }
                    }
                    .padding(.top, 22)

                    if model.settled {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("A regra que dispara", tint: Palette.drillInk)
                            Text(verbatim: rep.rule)
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.drillBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.drillBorder, lineWidth: 1)
                        }
                        .padding(.top, 18)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton("Próximo →", tint: Palette.drillInk) { model.next() }
                    .disabled(!model.settled)
            }
        }
    }

    // MARK: - The pace report

    private func report(_ content: DrillContent, _ model: DrillViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("O ritmo", tint: Palette.drillInk)
                    // Three verdicts, not two. Drill is the one rung whose
                    // gate (correctness) and whose signal (speed) can disagree,
                    // and branching this on `passed` alone made them contradict
                    // out loud: a 7-of-7 run at 12s a call was told "that is
                    // what automatic means" directly above "right, but slowly".
                    Text(!model.passed
                         ? "Ainda está sendo deduzido em vez de sabido."
                         : model.automatic
                           ? "Sai sem esforço. É isso que significa estar automático."
                           : "Certo, e ainda não automático.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.total) certas.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)
                    // The pace, which no other rung can report, and the reps
                    // that were right and slow — the finding Drill alone
                    // produces.
                    Text("\(model.pace)s por decisão, em geral.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(model.automatic ? Palette.inkMuted : Palette.amberInk)
                        .padding(.top, 4)
                    if !model.labored.isEmpty {
                        Text("Certo, mas devagar — esses ainda estão sendo deduzidos.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.reps) { rep in row(rep, model) }
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

    private func row(_ rep: DrillRep, _ model: DrillViewModel) -> some View {
        let right = model.session.hits[rep.id] == rep.answerIndex
        let took = model.session.took[rep.id] ?? 0
        let slow = right && took > drillTarget
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(right ? (slow ? Palette.amberInk : NodeState.mastered.color) : NodeState.shaky.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: rep.prompt)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(right ? (slow ? "Certo, devagar" : "Certo") : "Errado")
                        .font(.atlas(.sans, 12.5))
                        .foregroundStyle(right && !slow ? Palette.inkFaint : Palette.amberInk)
                    Text(verbatim: "\(DrillViewModel.seconds(took))s")
                        .font(.atlas(.mono, 12))
                        .foregroundStyle(Palette.inkFaint)
                        .monospacedDigit()
                }
                if !right {
                    Text(verbatim: rep.rule)
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
