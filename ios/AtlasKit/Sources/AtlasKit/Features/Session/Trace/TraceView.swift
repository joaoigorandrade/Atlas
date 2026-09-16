import Navigation
import SwiftUI

/// "Trace" — one case, walked stage by stage. Given where it has got to, what
/// does this stage hand the next? The links of a single chain, in order.
struct TraceView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: TraceViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Montando a cadeia, estágio por estágio…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? TraceViewModel(session: session)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: TraceViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.trace, title: model.node.label, back: { navigator.pop() }) {
                if model.total > 0 {
                    Chip(verbatim: "\(min(model.session.index + 1, model.total))/\(model.total)",
                         tint: Palette.traceInk)
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let stage = model.current {
                    run(content, stage, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.traceInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - One stage

    private func run(_ content: TraceContent, _ stage: TraceStage, _ model: TraceViewModel) -> some View {
        VStack(spacing: 0) {
            SegmentBar(model.rail, value: Text("Estágio \(model.session.index + 1) de \(model.total)"))
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // The one running case the whole chain walks. It stays at
                    // the top of every stage: the learner is tracing this, not
                    // answering questions about the concept in general.
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker("O caso", tint: Palette.traceInk)
                        Text(verbatim: content.scenario)
                            .font(.atlas(.sans, 14.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.cardAlt, in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairline, lineWidth: 1)
                    }

                    if !model.soFar.isEmpty { chain(model).padding(.top, 18) }

                    Kicker("Onde chegou", tint: Palette.traceInk).padding(.top, 18)
                    Text(verbatim: stage.reached)
                        .font(.atlas(.serif, 19))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                    Text("O que este estágio entrega ao próximo?")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 14)

                    VStack(spacing: 8) {
                        ForEach(Array(stage.nexts.enumerated()), id: \.offset) { index, next in
                            ChoiceRow(next, mark: model.mark(index),
                                      chosen: model.walked == index,
                                      enabled: !model.settled) { model.step(index) }
                        }
                    }
                    .padding(.top, 10)

                    if model.settled {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("O que este estágio entrega", tint: Palette.traceInk)
                            Text(verbatim: stage.handsOn)
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.traceBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.traceBorder, lineWidth: 1)
                        }
                        .padding(.top, 18)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton("Próximo estágio →", tint: Palette.traceInk) { model.next() }
                    .disabled(!model.settled)
            }
        }
    }

    /// The links already walked, with what each handed on. A rail of dots would
    /// say how far; this says what the case is carrying.
    private func chain(_ model: TraceViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("A cadeia até aqui")
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(model.soFar.enumerated()), id: \.element.id) { index, stage in
                    HStack(alignment: .top, spacing: 10) {
                        VStack(spacing: 0) {
                            Circle().fill(Palette.traceInk).frame(width: 6, height: 6)
                            if index < model.soFar.count - 1 {
                                Rectangle().fill(Palette.traceBorder).frame(width: 1)
                            }
                        }
                        .padding(.top, 5)
                        Text(verbatim: stage.handsOn)
                            .font(.atlas(.sans, 13))
                            .foregroundStyle(Palette.inkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 10)
                    }
                }
            }
            .padding(.top, 10)
        }
    }

    // MARK: - The walk report

    private func report(_ content: TraceContent, _ model: TraceViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A cadeia", tint: Palette.traceInk)
                    Text(model.passed
                         ? "Você percorre de ponta a ponta. A cadeia é sua, não só as pontas."
                         : "A cadeia se rompeu no meio do caminho.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    // Where it broke, not how many were right: everything after
                    // the first wrong link was carried forward from there.
                    if let brokeAt = model.brokeAt {
                        Text("A cadeia quebra no estágio \(brokeAt). Tudo depois disso partiu dali.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                    }

                    VStack(spacing: 2) {
                        ForEach(Array(content.stages.enumerated()), id: \.element.id) { index, stage in
                            row(index, stage, model)
                        }
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

    private func row(_ index: Int, _ stage: TraceStage, _ model: TraceViewModel) -> some View {
        let right = model.session.walked[stage.id] == stage.answerIndex
        // After the break the answer is not really wrong or right — it was given
        // from a position the learner had already left, and the row says so
        // rather than scoring it.
        let after = (model.brokeAt.map { index + 1 > $0 }) ?? false
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(after ? Palette.inkGhost : (right ? NodeState.mastered.color : NodeState.shaky.color))
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: stage.reached)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(after ? "Depois da quebra" : (right ? "Entregue corretamente" : "Aqui a cadeia quebrou"))
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(after ? Palette.inkFaint : (right ? Palette.inkFaint : Palette.amberInk))
                if !right {
                    Text(verbatim: stage.handsOn)
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
