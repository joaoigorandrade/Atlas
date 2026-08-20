import SwiftUI

/// "Socratic" (screen 15) — the contingent tutor. One probe at a time, the
/// learner's own words judged by the server, and the same rules the web
/// applies: a correct or a told answer closes the step, a near miss or a caught
/// error earns help and another try on the same probe.
struct SocraticView: View {
    let session: Session
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var steps: [SocraticStep] = []
    @State private var writing = true
    @State private var step = 0
    /// The scaffolding dial, least help → most. Opens mid-dial, at Hint.
    @State private var help = 1
    @State private var log: [Turn] = []
    @State private var answer = ""
    @State private var judging = false
    /// The next probe is planned but hasn't been written yet — the stream is
    /// still going. The learner sees that it's coming rather than a dead dock.
    @State private var awaiting = false
    @State private var message = ""

    struct Turn: Identifiable {
        let id = UUID()
        let learner: Bool
        let text: String
        /// A caught error, an affirmation or direct teaching — the AI bubble's tone.
        var quality: String?
    }

    /// How many probes this pass plans to run. Read off the material, not
    /// assumed: the spares are written but only a struggling learner spends one.
    private var total: Int { steps.isEmpty ? 1 : socraticPlan(steps) }
    /// The pass is over when the plan is spent — or when the stream ended
    /// short of it, which is the material's answer, not a hang.
    private var done: Bool { step >= total || (!writing && step >= steps.count) }

    var body: some View {
        VStack(spacing: 0) {
            PhaseBar(.socratic, title: session.node.label, back: { dismiss() }) {
                Button {
                    help = (help + 1) % 4
                } label: {
                    HStack(spacing: 7) {
                        Text("Apoio").font(.atlas(.mono, 11.5)).foregroundStyle(Palette.inkMuted)
                        HStack(alignment: .bottom, spacing: 2) {
                            ForEach(1...3, id: \.self) { level in
                                Capsule()
                                    .fill(help >= level ? Phase.socratic.tint : Palette.hairlineStrong)
                                    .frame(width: 3, height: CGFloat(3 + level * 4))
                            }
                        }
                    }
                    .padding(.horizontal, 11)
                    .frame(minHeight: 36)
                    .background(Palette.chipBg, in: .capsule)
                }
                .accessibilityLabel("Nível de apoio")
            }

            if log.isEmpty {
                Waiting(message.isEmpty ? "Escrevendo a primeira pergunta…" : message, spinning: message.isEmpty)
            } else {
                transcript
            }

            if done {
                Dock { CTAButton("Seguir para o Feynman →", tint: Phase.socratic.tint) { session.advance() } }
            } else if !log.isEmpty && !awaiting {
                answerDock
            }
        }
        .background(Palette.paper)
        .task { await load() }
    }

    private var transcript: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Kicker("Você chegou aqui pelo Consume", size: 10.5)
                    ForEach(log) { turn in bubble(turn).id(turn.id) }
                    if awaiting && !done {
                        HStack(spacing: 8) {
                            ProgressView().tint(Palette.inkFaint).controlSize(.small)
                            Text("Escrevendo a próxima pergunta…").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkFaint)
                        }
                    }
                    if judging {
                        HStack(spacing: 8) {
                            ProgressView().tint(Palette.inkFaint).controlSize(.small)
                            Text("Atlas está lendo sua resposta…").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkFaint)
                        }
                    }
                    if !message.isEmpty {
                        Text(message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 20)
            }
            .onChange(of: log.count) { _, _ in
                withAnimation(Motion.standard) { scroll.scrollTo(log.last?.id, anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func bubble(_ turn: Turn) -> some View {
        if turn.learner {
            Text(turn.text)
                .font(.atlas(.sans, 14.5))
                .foregroundStyle(Palette.inkSoft)
                .padding(.horizontal, 15).padding(.vertical, 13)
                .background(Palette.card, in: .rect(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 4, topTrailingRadius: 14))
                .overlay {
                    UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 4, topTrailingRadius: 14)
                        .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            VStack(alignment: .leading, spacing: 7) {
                Kicker("Atlas", tint: tone(turn.quality), size: 9.5)
                Text(turn.text).font(.atlas(.serif, 17)).lineSpacing(4).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The tutor's colour says what kind of turn it is: a catch is amber, an
    /// affirmation green, direct teaching and ordinary probes the phase blue.
    private func tone(_ quality: String?) -> Color {
        switch quality {
        case "correct": Palette.accent
        case "near", "wrong": Palette.amberInk
        default: Phase.socratic.tint
        }
    }

    private var answerDock: some View {
        Dock {
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Sua resposta", tint: Palette.inkGhost)
                    TextField("Responda com suas palavras…", text: $answer, axis: .vertical)
                        .font(.atlas(.serif, 15))
                        .lineLimit(1...4)
                        .padding(.horizontal, 15).padding(.vertical, 14)
                        .background(Palette.card, in: .rect(cornerRadius: 13))
                        .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                }
                MicButton(dictation: dictation, tint: Phase.socratic.tint) { answer += answer.isEmpty ? $0 : " \($0)" }
                    .frame(width: 52, height: 52)
                    .background(Palette.card, in: .rect(cornerRadius: 13))
                    .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                Button { Task { await send() } } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .frame(width: 52, height: 52)
                }
                .background(Phase.socratic.tint, in: .rect(cornerRadius: 13))
                .accessibilityLabel("Enviar resposta")
                .disabled(judging || answer.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    @State private var dictation = Dictation()

    // MARK: - The loop

    private func load() async {
        do {
            for try await landed in await store.api.socratic(session.context) {
                steps = landed
                if log.isEmpty || awaiting { openStep() }
            }
        } catch {
            message = Onboarding.copy(for: error, doing: "abrir esta sessão")
        }
        writing = false
    }

    /// Push the probe the pass is on, or park until it has been written.
    private func openStep() {
        guard step < total else { return }
        guard let probe = steps[safe: step] else { return awaiting = true }
        awaiting = false
        log.append(Turn(learner: false, text: probe.prompt))
    }

    /// The learner's answer joins the transcript on send; the verdict fills in
    /// beside it. Their words are never taken back by a failed judge — the
    /// screen says the judge stumbled and the same answer can be sent again.
    private func send() async {
        let text = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !judging, !text.isEmpty, let current = steps[safe: step] else { return }
        answer = ""
        message = ""
        log.append(Turn(learner: true, text: text))
        judging = true
        defer { judging = false }

        var context = session.context
        context["question"] = .string(log.last(where: { !$0.learner })?.text ?? current.prompt)
        context["reference"] = .string(current.tell)
        context["answer"] = .string(text)
        context["attempt"] = .number(Double(log.filter(\.learner).count))
        context["help"] = .number(Double(help))
        context["history"] = .array(log.suffix(8).map {
            .object(["role": .string($0.learner ? "learner" : "ai"), "text": .string($0.text)])
        })
        context["misconceptions"] = .array(current.replies.filter { $0.quality != "correct" }.map {
            .object(["label": .string($0.label), "quality": .string($0.quality)])
        })

        do {
            let verdict: SocraticJudgement = try await store.api.judge("socratic", context)
            log.append(Turn(learner: false, text: verdict.response, quality: verdict.quality))
            guard verdict.closesStep else {
                // A near miss or a caught error: same probe, more scaffolding.
                if verdict.quality == "wrong" { help = min(3, help + 1) }
                return
            }
            help = verdict.quality == "correct" ? max(0, help - 1) : min(3, help + 1)
            step += 1
            openStep()
        } catch {
            message = Onboarding.copy(for: error, doing: "avaliar sua resposta")
        }
    }
}
