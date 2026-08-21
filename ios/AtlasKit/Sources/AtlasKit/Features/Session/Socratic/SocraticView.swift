import Navigation
import SwiftUI

/// "Socratic" (screen 15) — the contingent tutor. One probe at a time, the
/// learner's own words judged by the server.
struct SocraticView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: SocraticViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Waiting("Escrevendo a primeira pergunta…") }
        }
        .background(Palette.paper)
        .task {
            let model = model ?? SocraticViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    private func content(_ model: SocraticViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.socratic, title: model.node.label, back: { navigator.pop() }) {
                helpDial(model)
            }

            if model.log.isEmpty {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
            } else {
                transcript(model)
            }

            if model.done {
                Dock { CTAButton("Seguir para o Feynman →", tint: Phase.socratic.tint) { model.advance() } }
            } else if !model.log.isEmpty && !model.awaiting {
                answerDock(model)
            }
        }
    }

    private func helpDial(_ model: SocraticViewModel) -> some View {
        Button { model.cycleHelp() } label: {
            HStack(spacing: 7) {
                Text("Apoio").font(.atlas(.mono, 11.5)).foregroundStyle(Palette.inkMuted)
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(1...3, id: \.self) { level in
                        Capsule()
                            .fill(model.help >= level ? Phase.socratic.tint : Palette.hairlineStrong)
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

    private func transcript(_ model: SocraticViewModel) -> some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Kicker("Você chegou aqui pelo Consume", size: 10.5)
                    ForEach(model.log) { turn in bubble(turn).id(turn.id) }
                    if model.awaiting && !model.done {
                        working("Escrevendo a próxima pergunta…")
                    }
                    if model.judging {
                        working("Atlas está lendo sua resposta…")
                    }
                    if !model.message.isEmpty {
                        Text(verbatim: model.message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 20)
            }
            .onChange(of: model.log.count) { _, _ in
                withAnimation(Motion.standard) { scroll.scrollTo(model.log.last?.id, anchor: .bottom) }
            }
        }
    }

    private func working(_ text: LocalizedStringKey) -> some View {
        HStack(spacing: 8) {
            ProgressView().tint(Palette.inkFaint).controlSize(.small)
            Text(text).font(.atlas(.sans, 13)).foregroundStyle(Palette.inkFaint)
        }
    }

    @ViewBuilder
    private func bubble(_ turn: SocraticViewModel.Turn) -> some View {
        if turn.learner {
            Text(verbatim: turn.text)
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
                Kicker(verbatim: "Atlas", tint: tone(turn.quality), size: 9.5)
                Text(verbatim: turn.text).font(.atlas(.serif, 17)).lineSpacing(4).foregroundStyle(Palette.ink)
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

    private func answerDock(_ model: SocraticViewModel) -> some View {
        @Bindable var model = model
        return Dock {
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Sua resposta", tint: Palette.inkGhost)
                    TextField("Responda com suas palavras…", text: $model.answer, axis: .vertical)
                        .font(.atlas(.serif, 15))
                        .lineLimit(1...4)
                        .padding(.horizontal, 15).padding(.vertical, 14)
                        .background(Palette.card, in: .rect(cornerRadius: 13))
                        .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                }
                MicButton(dictation: model.dictation, tint: Phase.socratic.tint) { model.dictated($0) }
                    .frame(width: 52, height: 52)
                    .background(Palette.card, in: .rect(cornerRadius: 13))
                    .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                Button { Task { await model.send() } } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .frame(width: 52, height: 52)
                }
                .background(Phase.socratic.tint, in: .rect(cornerRadius: 13))
                .accessibilityLabel("Enviar resposta")
                .disabled(!model.canSend)
            }
        }
    }
}
