import SwiftUI

// The three placement probes that are not a list of options. The port of
// `components/onboarding/DiagnosticAnswers.tsx`.
//
// A four-option question measures RECOGNITION, which is the right instrument
// for a general topic and the wrong one everywhere else — it cannot tell
// whether a learner can row-reduce, and for a language it measures the axis
// learners are most often mis-placed on. Placement decides what the map prunes,
// so the probe has to be shaped like the domain.
//
// All three grade locally, through `gradeDiagnostic`. Nothing here reaches a
// model: this sits on the onboarding path, where a round trip per answer would
// be the whole experience.

/// The shared field styling — the same box Steelman and the settings screen
/// draw, kept in one place so three probes cannot drift apart.
private struct ProbeField: ViewModifier {
    func body(content: Content) -> some View {
        content
            .textFieldStyle(.plain)
            .padding(13)
            .background(Palette.card, in: .rect(cornerRadius: 11))
            .overlay {
                RoundedRectangle(cornerRadius: 11)
                    .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
            }
    }
}

/// `formal`: the learner works it out. Checked arithmetically, so a comma
/// decimal, a fraction and a percentage are all the same answer.
struct ComputeAnswer: View {
    let onAnswer: (DiagnosticAnswer) -> Void
    @State private var value = ""

    var body: some View {
        VStack(spacing: 12) {
            TextField("A resposta — um número, uma fração, uma porcentagem…", text: $value)
                .font(.atlas(.mono, 15))
                .keyboardType(.numbersAndPunctuation)
                .submitLabel(.done)
                .onSubmit(send)
                .modifier(ProbeField())
            SubmitAnswer(disabled: value.trimmed.isEmpty, action: send)
        }
    }

    private func send() {
        guard !value.trimmed.isEmpty else { return }
        onAnswer(.text(value))
    }
}

/// `performative`: the learner says it. This is the whole point of the probe —
/// recognising a word you could never produce is exactly the mis-placement a
/// four-option question makes.
struct SpeakAnswer: View {
    let dictation: Dictation
    let onAnswer: (DiagnosticAnswer) -> Void
    @State private var said = ""

    var body: some View {
        VStack(spacing: 12) {
            AnswerEditor(
                text: $said, placeholder: String(localized: "Diga em voz alta…"),
                dictation: dictation, minHeight: 92
            )
            SubmitAnswer(disabled: said.trimmed.isEmpty) { onAnswer(.text(said)) }
        }
    }
}

/// `interpretive`: chronology is the spine a learner either has or does not,
/// which makes it the honest placement probe for a topic read in time.
struct OrderAnswer: View {
    let opts: [DiagnosticQuestion.Option]
    let onAnswer: (DiagnosticAnswer) -> Void
    @State private var order: [String] = []

    private var remaining: [DiagnosticQuestion.Option] {
        opts.filter { !order.contains($0.label) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Toque na ordem certa, do mais antigo para o mais recente.")
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)

            ForEach(Array(order.enumerated()), id: \.element) { position, label in
                HStack(spacing: 8) {
                    Text(verbatim: "\(position + 1).")
                        .font(.atlas(.mono, 13))
                        .foregroundStyle(Palette.inkGhost)
                    Text(verbatim: label)
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.ink)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.chipBg, in: .rect(cornerRadius: 11))
            }

            ForEach(remaining, id: \.label) { option in
                Button { withAnimation(Motion.snap) { order.append(option.label) } } label: {
                    Text(verbatim: option.label)
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .background(Palette.card, in: .rect(cornerRadius: 11))
                        .overlay {
                            RoundedRectangle(cornerRadius: 11)
                                .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                        }
                }
                .pressable()
            }

            if !order.isEmpty {
                Button("Recomeçar") { withAnimation(Motion.snap) { order = [] } }
                    .font(.atlas(.sans, 13))
                    .foregroundStyle(Palette.inkMuted)
                    .frame(minHeight: Metrics.tap)
            }

            SubmitAnswer(disabled: !remaining.isEmpty) { onAnswer(.order(order)) }
        }
    }
}

/// One button, three probes — the placement's dock only appears once an answer
/// has been graded, so each of these carries its own way to commit.
private struct SubmitAnswer: View {
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        CTAButton("Responder →", action: action)
            .disabled(disabled)
    }
}
