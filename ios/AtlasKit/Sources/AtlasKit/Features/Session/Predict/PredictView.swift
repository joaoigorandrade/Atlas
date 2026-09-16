import Navigation
import SwiftUI

/// "Predict" — say what happens before you are shown, and commit to it. The
/// test of having a mechanism is whether it forecasts, so only a `principle`
/// runs this rung.
struct PredictView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: PredictViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Montando situações para prever…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? PredictViewModel(session: session)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: PredictViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.predict, title: model.node.label, back: { navigator.pop() }) {
                if model.total > 0 {
                    Chip(verbatim: "\(min(model.session.index + 1, model.total))/\(model.total)",
                         tint: Palette.predictInk)
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let setup = model.current {
                    run(setup, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.predictInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - One forecast

    private func run(_ setup: PredictSetup, _ model: PredictViewModel) -> some View {
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
                    Kicker("A situação", tint: Palette.predictInk)
                    Text(verbatim: setup.situation)
                        .font(.atlas(.serif, 19))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    // The confidence comes first and locks once the forecast is
                    // in. Rating a result you have already seen is not
                    // calibration, and the outcomes stay off screen until it is
                    // on record.
                    sureness(model).padding(.top, 20)

                    if model.canForecast {
                        Text("O que acontece?")
                            .font(.atlas(.sans, 14))
                            .foregroundStyle(Palette.inkMuted)
                            .padding(.top, 20)
                        VStack(spacing: 8) {
                            ForEach(Array(setup.outcomes.enumerated()), id: \.offset) { index, outcome in
                                ChoiceRow(outcome, mark: model.mark(index),
                                          chosen: model.forecast == index,
                                          enabled: !model.settled) { model.commit(index) }
                            }
                        }
                        .padding(.top, 10)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    if model.settled {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("Por que tinha de ser assim", tint: Palette.predictInk)
                            Text(verbatim: setup.because)
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.predictBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.predictBorder, lineWidth: 1)
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
                CTAButton("Próximo →", tint: Palette.predictInk) { model.next() }
                    .disabled(!model.settled)
            }
        }
    }

    /// Three rungs, weighted so the ordering is visible rather than implied —
    /// the same scale the Crucible's tap draws, at this phase's accent.
    private func sureness(_ model: PredictViewModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Kicker("Quanta certeza você tem?", tint: Palette.predictInk)
            ForEach(0..<predictConfidence.count, id: \.self) { level in
                Button { model.sure(level) } label: {
                    HStack(spacing: 12) {
                        Text(PredictViewModel.levelLabel(level))
                            .font(.atlas(.sans, 15))
                            .foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        HStack(spacing: 3) {
                            ForEach(0..<3, id: \.self) { bar in
                                Capsule()
                                    .fill(bar <= level ? Palette.predictInk : Palette.hairlineStrong)
                                    .frame(width: 4, height: CGFloat(6 + bar * 5))
                            }
                        }
                        .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 15)
                    .padding(.vertical, 12)
                    .frame(minHeight: Metrics.tap, alignment: .leading)
                    .background(model.sureness == level ? Palette.predictBg : Palette.card,
                                in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(model.sureness == level ? Palette.predictInk : Palette.hairlineStrong,
                                          lineWidth: model.sureness == level ? 1.5 : 1)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .pressable()
                // Locked once the forecast is committed: what it would record
                // after that is a rating of an outcome already on screen.
                .disabled(model.settled)
                .accessibilityAddTraits(model.sureness == level ? [.isSelected] : [])
            }
        }
    }

    // MARK: - The forecast report

    private func report(_ content: PredictContent, _ model: PredictViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("O mecanismo", tint: Palette.predictInk)
                    Text(model.passed
                         ? "O mecanismo prevê por você. É para isso que serve ter um."
                         : "Alguns foram para o outro lado.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.total) previsões confirmadas.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    // The reading this phase exists for: a forecast held
                    // confidently and still wrong is worse than one held loosely.
                    if !model.overconfident.isEmpty {
                        Text("Os que você tinha certeza e errou são os que valem revisitar.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.setups) { setup in row(setup, model) }
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

    private func row(_ setup: PredictSetup, _ model: PredictViewModel) -> some View {
        let right = model.session.forecasts[setup.id] == setup.answerIndex
        let sure = model.session.sureness[setup.id]
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(right ? NodeState.mastered.color : NodeState.shaky.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: setup.situation)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    // The verdict in words as well as in colour, and beside it
                    // what they claimed before they saw the outcome — the two
                    // halves of a calibration reading, on one line.
                    Text(right ? "Confirmou" : "Não confirmou")
                        .font(.atlas(.sans, 12.5))
                        .foregroundStyle(right ? Palette.inkFaint : Palette.amberInk)
                    if let sure {
                        Text(PredictViewModel.levelLabel(sure))
                            .font(.atlas(.sans, 12.5))
                            .foregroundStyle(Palette.inkFaint)
                    }
                }
                if !right {
                    Text(verbatim: setup.because)
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
