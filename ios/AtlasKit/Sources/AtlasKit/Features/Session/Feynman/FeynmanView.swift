import Navigation
import SwiftUI

/// "Feynman" (screen 16) — the teach-back. One sub-point at a time, taught in
/// the learner's own words; the judge diffs the finished explanation against the
/// rubric, and every row it can't find becomes a gap under the node.
struct FeynmanView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: FeynmanViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Waiting("Escrevendo os tópicos…") }
        }
        .background(Palette.paper)
        .task {
            let model = model ?? FeynmanViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.feynman, title: model.node.label, back: { navigator.pop() }) {
                if !model.beats.isEmpty {
                    Text(verbatim: "\(model.index + 1) / \(model.beats.count)")
                        .font(.atlas(.mono, 10.5))
                        .tracking(1)
                        .foregroundStyle(Phase.feynman.tint)
                }
            }

            if let judgement = model.judgement {
                report(judgement, model)
            } else if let beat = model.beat {
                teach(beat, model)
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
            }
        }
    }

    // MARK: - Teaching

    private func teach(_ beat: FeynmanBeat, _ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SegmentBar(model.rail, height: 3).padding(.top, 16)

                    Text("Sem pânico de tela em branco. Comece pelo mais simples: que problema esse conceito realmente resolve? Ensine-me isso primeiro — o resto sai sozinho.")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.amberInk)
                        .padding(.horizontal, 13).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.amberBg)
                        .overlay(alignment: .leading) { Rectangle().fill(NodeState.frontier.color).frame(width: 3) }
                        .clipShape(.rect(bottomTrailingRadius: 8, topTrailingRadius: 8))
                        .padding(.top, 20)

                    Card {
                        VStack(alignment: .leading, spacing: 0) {
                            Kicker("Tópico \(model.index + 1)", tint: Palette.inkGhost)
                            Text(verbatim: beat.subPoint)
                                .font(.atlas(.serif, 21))
                                .foregroundStyle(Palette.ink)
                                .padding(.top, 8)
                            AnswerEditor(text: model.binding(for: beat),
                                         placeholder: String(localized: "Ensine com suas palavras…"),
                                         tint: Phase.feynman.tint)
                                .padding(.top, 14)
                        }
                        .padding(20)
                    }
                    .padding(.top, 16)

                    if !model.message.isEmpty {
                        Text(verbatim: model.message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk).padding(.top, 14)
                    }
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 24)
            }

            Dock {
                HStack(spacing: 10) {
                    GhostButton("Anterior") { model.back() }
                        .frame(width: 96)
                        .opacity(model.isFirst ? 0.4 : 1)
                        .disabled(model.isFirst)
                    if model.isLast && !model.writing {
                        CTAButton(model.judging ? "Lendo sua explicação…" : "Enviar explicação",
                                  tint: Phase.feynman.tint) {
                            Task { await model.submit() }
                        }
                        .disabled(!model.canSubmit)
                    } else {
                        CTAButton("Próximo tópico", tint: Phase.feynman.tint) { model.next() }
                            .disabled(model.isLast)
                    }
                }
            }
        }
    }

    // MARK: - The Gap Report

    private func report(_ judgement: FeynmanJudgement, _ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Relatório de lacunas", tint: Phase.feynman.tint, size: 11)
                    Text(verbatim: judgement.response)
                        .font(.atlas(.serif, 17))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 12)

                    ForEach(Array(judgement.verdicts.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 11) {
                            Circle().fill(color(row.verdict)).frame(width: 8, height: 8).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(verbatim: model.subPoint(at: row.i))
                                    .font(.atlas(.serif, 15.5))
                                    .foregroundStyle(Palette.ink)
                                if let quote = row.quote {
                                    Text(verbatim: "“\(quote)”").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 14)
                    }

                    if let jargon = judgement.jargon, !jargon.isEmpty {
                        Kicker("Termos que você não abriu").padding(.top, 24)
                        FlowChips(jargon.map { ($0, NodeState.shaky) }).padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 22)
            }
            Dock { CTAButton("Seguir para o Connect →", tint: Palette.connectInk) { model.advance() } }
        }
    }

    /// Green explained it, grey skipped it, red got it wrong — the same three
    /// the web's Gap Report draws.
    private func color(_ verdict: String) -> Color {
        switch verdict {
        case "good": NodeState.mastered.color
        case "confused": NodeState.gap.color
        default: NodeState.unknown.color
        }
    }
}
