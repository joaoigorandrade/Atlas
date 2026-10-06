import Navigation
import SwiftUI

/// "Explain" — how would you explain this to someone who has never heard of
/// it? A model explanation, one card at a time, then a listener's
/// misconception and the reply that actually clears it up.
struct ExplainView: View {
    let session: SessionViewModel
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ExplainViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Montando como explicar isso…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? ExplainViewModel(session: session)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: ExplainViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.explain, title: model.node.label, back: { navigator.pop() }) {
                Chip(verbatim: "\(model.session.revealed)/\(ExplainCard.allCases.count)",
                     tint: Palette.explainInk)
            }
            if let content = model.content {
                sheet(content, model)
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.explainInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
    }

    private func sheet(_ content: ExplainContent, _ model: ExplainViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Como você explicaria isso para alguém que nunca ouviu falar?")
                        .font(.atlas(.serif, 15.5))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(model.cards, id: \.self) { card($0, content).transition(.opacity) }
                    if model.checking { check(content, model).transition(.opacity) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            if !model.checking {
                Dock { CTAButton("Próximo cartão →", tint: Palette.explainInk) { model.reveal() } }
            } else if model.session.done {
                Dock { CTAButton(model.handOffLabel, tint: model.handOffTint) { model.advance() } }
            }
        }
        .sensoryFeedback(.success, trigger: model.session.done)
    }

    // MARK: - The model, card by card

    private func card(_ card: ExplainCard, _ content: ExplainContent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            switch card {
            case .problem:
                Kicker("Comece pelo problema", tint: Palette.explainInk)
                prose(content.problem)
            case .analogy:
                Kicker("A analogia", tint: Palette.explainInk)
                prose(content.analogy.text)
                aside("Onde ela falha", content.analogy.breaks)
            case .order:
                Kicker("A ordem", tint: Palette.explainInk)
                ForEach(Array(content.order.enumerated()), id: \.offset) { i, idea in
                    prose("\(i + 1). \(idea)")
                }
            case .misconception:
                Kicker("O que seu ouvinte vai entender errado", tint: Palette.explainInk)
                prose(content.misconception.belief)
                aside("Por que é tentador", content.misconception.tempting)
            case .checkBack:
                Kicker("Confira se ele entendeu", tint: Palette.explainInk)
                prose(content.checkBack.question)
                aside("Uma resposta certa contém", content.checkBack.rightAnswer)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boxed(Palette.card, border: Palette.hairlineStrong, radius: Metrics.panelRadius)
    }

    private func prose(_ text: String) -> some View {
        Text(verbatim: text)
            .font(.atlas(.serif, 16.5))
            .lineSpacing(4)
            .foregroundStyle(Palette.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func aside(_ head: LocalizedStringKey, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Kicker(head, tint: Palette.inkFaint)
            Text(verbatim: text)
                .font(.atlas(.serif, 15))
                .foregroundStyle(Palette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 4)
    }

    // MARK: - The check

    private func check(_ content: ExplainContent, _ model: ExplainViewModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Seu ouvinte diz", tint: Palette.explainInk)
                .padding(.top, 12)
            Text(verbatim: content.listener.says)
                .font(.atlas(.display, 18))
                .italic()
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .boxed(Palette.explainBg, border: Palette.explainBorder, radius: Metrics.panelRadius)

            if let picked = model.picked {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker(picked.correct ? "Isso desfaz o erro" : "Isso deixa o erro de pé",
                           tint: picked.correct ? Palette.accent : Palette.amberInk)
                    Text(verbatim: picked.label)
                        .font(.atlas(.serif, 15.5))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(verbatim: picked.why)
                        .font(.atlas(.serif, 15))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    if !picked.correct {
                        Text("Tente outra resposta.")
                            .font(.atlas(.serif, 15))
                            .foregroundStyle(Palette.amberInk)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .boxed(picked.correct ? Palette.successBg : Palette.amberBg,
                       border: Palette.hairlineStrong, radius: Metrics.panelRadius)
            }

            if !model.session.done {
                Text("O que você responde?")
                    .font(.atlas(.serif, 16))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 4)
                ForEach(model.open, id: \.index) { option in
                    ChoiceRow(option.reply.label) { model.pick(option.index) }
                }
            }
        }
    }
}
