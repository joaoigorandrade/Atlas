import Navigation
import SwiftUI

/// The Frontier Feed: a round of pretest cards dealt from the next few
/// readings, each answer bet in ink, then a closing tally that sends each miss
/// to its reading. Mirrors the web's `FeedView`.
struct FeedView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: FeedViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .paper()
        .navigationBarBackButtonHidden()
        .toolbar(.hidden, for: .navigationBar)
        .task { if model == nil { model = FeedViewModel(store: store) } }
    }

    private func content(_ model: FeedViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                HStack(spacing: 10) {
                    BackButton { navigator.pop() }
                    VStack(alignment: .leading, spacing: 2) {
                        Kicker("Feed da fronteira", tint: Palette.accent, size: 9.5)
                        Text(verbatim: store.subject).font(.atlas(.serif, 17)).foregroundStyle(Palette.ink).lineLimit(1)
                    }
                }
                .padding(.leading, -12)
            } trailing: {
                Text("\(model.ink) de tinta")
                    .font(.atlas(.caps, 15))
                    .foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let last = model.last {
                        outcome(last, model)
                    } else if let card = model.card {
                        self.card(card, model).id(card.chunk.id)
                    } else {
                        done(model)
                    }
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 24)
                .padding(.bottom, 40)
                .animation(Motion.standard, value: model.answered)
                .animation(Motion.standard, value: model.card)
            }
        }
    }

    private func read(_ node: ConceptNode) {
        navigator.navigate(to: .session(node, phase: nil))
    }

    private func card(_ card: FeedViewModel.Card, _ model: FeedViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(model.progress)
            Kicker(verbatim: card.node.label, tint: Palette.accent, size: 11).padding(.top, 8)
            Text(verbatim: card.chunk.kicker)
                .font(.atlas(.display, 28))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if let check = card.chunk.check {
                PretestCard(check: check, held: model.held, guess: model.guess, bet: model.bet)
                    .padding(.top, 22)
            }
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func outcome(_ last: FeedViewModel.Outcome, _ model: FeedViewModel) -> some View {
        let tint = last.correct ? Palette.accent : Palette.amberInk
        return Card(border: tint.opacity(0.5)) {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(verbatim: "\(last.card.node.label) · \(last.card.chunk.kicker)", tint: tint)
                Text(last.correct ? "Você já sabia isto" : "Desta vez não")
                    .font(.atlas(.display, 30))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 8)
                Text(inkCopy(last.stake, correct: last.correct))
                    .font(.atlas(.caps, 18))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 4)
                Group {
                    if last.correct {
                        // The reason, so a lucky guess still leaves with it.
                        Text(Markdown.rich(last.card.chunk.check?.right ?? ""))
                    } else {
                        Text("A resposta está na leitura: a seção abre por inteiro, com esta pergunta esperando no final.")
                    }
                }
                .font(.atlas(.serif, 15.5))
                .lineSpacing(3)
                .foregroundStyle(Palette.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
                if !last.correct && last.stake == 2 { ConfidentMiss().padding(.top, 10) }
                VStack(spacing: 10) {
                    CTAButton("Próxima carta →") { withAnimation(Motion.standard) { model.next() } }
                    if !last.correct { GhostButton("Ler agora →") { read(last.card.node) } }
                }
                .padding(.top, 20)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func done(_ model: FeedViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.answered > 0 {
                Kicker("Rodada concluída", tint: Palette.accent)
                Text("\(model.answered) cartas respondidas")
                    .font(.atlas(.display, 34))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 8)
                Text(model.roundInk < 0 ? "−\(-model.roundInk) de tinta nesta rodada" : "+\(model.roundInk) de tinta nesta rodada")
                    .font(.atlas(.caps, 18))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 4)
                Text(model.missed.isEmpty ? "Todas as cartas acertaram — nada pendente desta rodada." : "Ler em seguida")
                    .font(.atlas(.serif, 15.5))
                    .foregroundStyle(Palette.inkSoft)
                    .padding(.top, 24)
                ForEach(model.missed) { node in
                    Button { read(node) } label: {
                        HStack {
                            Text(verbatim: node.label).font(.atlas(.serif, 16.5)).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text("Ler →").font(.atlas(.caps, 14)).foregroundStyle(Palette.accent)
                        }
                        .padding(.horizontal, 15)
                        .frame(minHeight: Metrics.tap)
                        .boxed(Palette.card, border: Palette.hairlineStrong, radius: 3)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .pressable()
                    .padding(.top, 8)
                }
            } else {
                Kicker("Nada para distribuir ainda", tint: Palette.accent)
                Text("As próximas leituras ainda estão sendo escritas, ou todas as seções delas já foram perguntadas. Volte quando a próxima abrir.")
                    .font(.atlas(.serif, 15.5))
                    .foregroundStyle(Palette.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }
            GhostButton("Voltar ao mapa") { navigator.pop() }.padding(.top, 24)
        }
        .transition(.opacity)
    }
}
