import SwiftUI

/// "Feynman" (screen 16) — the teach-back. One sub-point at a time, taught in
/// the learner's own words; the rubric rows are never shown before they teach,
/// because what they never think to mention is the whole diagnostic. The judge
/// diffs the finished explanation against the rubric, and every row it can't
/// find becomes a gap under the node.
struct FeynmanView: View {
    let session: Session
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var beats: [FeynmanBeat] = []
    @State private var writing = true
    @State private var index = 0
    /// What was taught per beat, by beat id — the learner's own words, kept
    /// while they walk back and forth across the rail.
    @State private var taught: [String: String] = [:]
    @State private var judging = false
    @State private var judgement: FeynmanJudgement?
    @State private var message = ""

    private var beat: FeynmanBeat? { beats[safe: index] }
    private var last: Bool { index >= beats.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            PhaseBar(.feynman, title: session.node.label, back: { dismiss() }) {
                if !beats.isEmpty {
                    Text("\(index + 1) / \(beats.count)")
                        .font(.atlas(.mono, 10.5))
                        .tracking(1)
                        .foregroundStyle(Phase.feynman.tint)
                }
            }

            if let judgement {
                report(judgement)
            } else if let beat {
                teach(beat)
            } else {
                Waiting(message.isEmpty ? "Escrevendo os tópicos…" : message, spinning: message.isEmpty)
            }
        }
        .background(Palette.paper)
        .task { await load() }
    }

    // MARK: - Teaching

    private func teach(_ beat: FeynmanBeat) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SegmentBar(beats.indices.map {
                        $0 < index ? NodeState.mastered.color : ($0 == index ? Phase.feynman.tint : nil)
                    }, height: 3)
                    .padding(.top, 16)

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
                            Kicker("Tópico \(index + 1)", tint: Palette.inkGhost)
                            Text(beat.subPoint)
                                .font(.atlas(.serif, 21))
                                .foregroundStyle(Palette.ink)
                                .padding(.top, 8)
                            AnswerEditor(text: binding(for: beat), placeholder: "Ensine com suas palavras…",
                                         tint: Phase.feynman.tint)
                                .padding(.top, 14)
                        }
                        .padding(20)
                    }
                    .padding(.top, 16)

                    if !message.isEmpty {
                        Text(message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk).padding(.top, 14)
                    }
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 24)
            }

            Dock {
                HStack(spacing: 10) {
                    GhostButton("Anterior") { withAnimation(Motion.standard) { index = max(0, index - 1) } }
                        .frame(width: 96)
                        .opacity(index == 0 ? 0.4 : 1)
                        .disabled(index == 0)
                    if last && !writing {
                        CTAButton(judging ? "Lendo sua explicação…" : "Enviar explicação", tint: Phase.feynman.tint) {
                            Task { await submit() }
                        }
                        .disabled(judging || taught.values.allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty })
                    } else {
                        CTAButton("Próximo tópico", tint: Phase.feynman.tint) {
                            withAnimation(Motion.standard) { index += 1 }
                        }
                        .disabled(last)
                    }
                }
            }
        }
    }

    private func binding(for beat: FeynmanBeat) -> Binding<String> {
        Binding(get: { taught[beat.id] ?? "" }, set: { taught[beat.id] = $0 })
    }

    // MARK: - The Gap Report

    private func report(_ judgement: FeynmanJudgement) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Relatório de lacunas", tint: Phase.feynman.tint, size: 11)
                    Text(judgement.response)
                        .font(.atlas(.serif, 17))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 12)

                    ForEach(Array(judgement.verdicts.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 11) {
                            Circle().fill(color(row.verdict)).frame(width: 8, height: 8).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(beats[safe: row.i]?.subPoint ?? "")
                                    .font(.atlas(.serif, 15.5))
                                    .foregroundStyle(Palette.ink)
                                if let quote = row.quote {
                                    Text("“\(quote)”").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
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
            Dock { CTAButton("Seguir para o Connect →", tint: Palette.connectInk) { session.advance() } }
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

    // MARK: - Loading and judging

    private func load() async {
        do {
            for try await landed in await store.api.feynman(session.context) { beats = landed }
        } catch {
            message = Onboarding.copy(for: error, doing: "escrever os tópicos")
        }
        writing = false
    }

    /// The whole teach-back is judged at once: a rubric row is about the
    /// explanation end to end, not about the box it happened to be typed in.
    private func submit() async {
        guard !judging, !beats.isEmpty else { return }
        judging = true
        defer { judging = false }
        var context = session.context
        context["rubric"] = .array(beats.map {
            .object(["subPoint": .string($0.subPoint), "mustConvey": .array($0.mustConvey.map { .string($0) })])
        })
        context["answer"] = .string(beats.compactMap { taught[$0.id] }.joined(separator: "\n\n"))
        do {
            let verdict: FeynmanJudgement = try await store.api.judge("feynman", context)
            session.writeFeynmanGaps(verdict, beats: beats)
            judgement = verdict
        } catch {
            message = Onboarding.copy(for: error, doing: "avaliar sua explicação")
        }
    }
}
