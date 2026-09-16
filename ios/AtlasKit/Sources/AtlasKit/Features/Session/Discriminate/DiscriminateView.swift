import Navigation
import SwiftUI

/// "Discriminate" — where does this concept stop and the next one start? A
/// concept IS a classification, so telling instances from near-misses is not a
/// warm-up for the ladder: it is the thing being learned.
struct DiscriminateView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: DiscriminateViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Separando casos e quase-casos…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? DiscriminateViewModel(session: session)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: DiscriminateViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.discriminate, title: model.node.label, back: { navigator.pop() }) {
                if model.total > 0 {
                    Chip(verbatim: "\(min(model.session.index + 1, model.total))/\(model.total)",
                         tint: Palette.discriminateInk)
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let item = model.current {
                    run(content, item, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.discriminateInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - One case

    private func run(
        _ content: DiscriminateContent, _ item: DiscriminateCase, _ model: DiscriminateViewModel
    ) -> some View {
        VStack(spacing: 0) {
            SegmentBar(model.rail, value: Text("\(model.score) de \(model.total)"))
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("O caso", tint: Palette.discriminateInk)
                    Text(verbatim: item.candidate)
                        .font(.atlas(.serif, 19))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    // Asked once rather than per case: the cases vary, the
                    // question does not.
                    Text(verbatim: content.ask)
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 16)

                    VStack(spacing: 8) {
                        ForEach(Array(item.readings.enumerated()), id: \.offset) { index, reading in
                            ChoiceRow(reading, mark: model.mark(index),
                                      chosen: model.called == index,
                                      enabled: !model.settled) { model.call(index) }
                        }
                    }
                    .padding(.top, 14)

                    // The feature that decides THIS case, and only after the
                    // commit — a learner who can read the verdict while
                    // choosing is doing recognition.
                    if model.settled {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("O que decide", tint: Palette.discriminateInk)
                            Text(verbatim: item.decidedBy)
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.discriminateBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.discriminateBorder, lineWidth: 1)
                        }
                        .padding(.top, 16)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton("Próximo caso →", tint: Palette.discriminateInk) { model.next() }
                    .disabled(!model.settled)
            }
        }
    }

    // MARK: - The boundary report

    private func report(_ content: DiscriminateContent, _ model: DiscriminateViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A fronteira", tint: Palette.discriminateInk)
                    Text(model.passed
                         ? "Você distingue isso dos vizinhos. É isso que significa ter o conceito."
                         : "A fronteira ainda está solta em alguns pontos.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.total) casos lidos corretamente.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    // The over-inclusive miss is called out on its own: a
                    // learner who waves every near-miss through scores whatever
                    // fraction of the run happens to be instances, and that is
                    // luck rather than the boundary.
                    if !model.overIncluded.isEmpty {
                        Text("Você deixou passar casos que só parecem. É aí que está a fronteira, não na definição.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.cases) { item in row(item, model) }
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

    private func row(_ item: DiscriminateCase, _ model: DiscriminateViewModel) -> some View {
        let right = model.session.calls[item.id] == item.answerIndex
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(right ? NodeState.mastered.color : NodeState.shaky.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: item.candidate)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                // The verdict in words as well as in colour: a dot is invisible
                // to VoiceOver and indistinguishable to a colour-blind learner.
                Text(right ? "Lido corretamente" : "Lido errado")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(right ? Palette.inkFaint : Palette.amberInk)
                if !right {
                    Text(verbatim: item.decidedBy)
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
