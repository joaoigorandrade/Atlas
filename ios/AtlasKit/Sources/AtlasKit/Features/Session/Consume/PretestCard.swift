import SwiftUI

/// The check before a section: one guess, the answer never shown, and then the
/// ink bet on that guess — placed after it is given and before anything says
/// whether it was right, the order that makes a confident miss the one that
/// sticks. Consume's pretest and every Frontier Feed card are this card; the
/// end-of-section check takes no bet. Mirrors `SectionCheck` in pretest mode.
struct PretestCard: View {
    let check: ConsumePrediction
    /// The option guessed and waiting on its bet, owned by the screen's model.
    let held: Int?
    let guess: (Int) -> Void
    let bet: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Antes de ler", tint: Palette.inkMuted)
            Text(Markdown.rich(check.q))
                .font(.atlas(.serif, 18.5))
                .lineSpacing(4)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
            if let held {
                Kicker("Sua resposta", tint: Palette.accent).padding(.top, 14)
                Text(Markdown.rich(check.opts[safe: held]?.label ?? ""))
                    .font(.atlas(.serif, 16.5))
                    .foregroundStyle(Palette.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
                stakes.padding(.top, 16)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else {
                Text("Arrisque primeiro — uma tentativa. Se você já sabe, pode seguir; errar faz a leitura fixar.")
                    .font(.atlas(.serif, 14))
                    .lineSpacing(2)
                    .foregroundStyle(Palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                VStack(spacing: 9) {
                    ForEach(Array(check.opts.enumerated()), id: \.offset) { option, opt in
                        ChoiceRow(Markdown.plain(opt.label)) { guess(option) }
                    }
                }
                .padding(.top, 14)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boxed(Palette.accentBg, border: Palette.accent.opacity(0.18), radius: Metrics.cardRadius)
        .animation(Motion.standard, value: held)
    }

    /// The three taps, weighted so the order is visible, and all three alike —
    /// a highlighted answer is a suggested one. `inkStakes` order.
    private var stakes: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Aposte sua tinta — quão seguro você está dessa resposta?")
                .font(.atlas(.serif, 17))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(inkStakes.indices, id: \.self) { stake in
                Button { bet(stake) } label: {
                    HStack(spacing: 12) {
                        Text(Self.sure[stake])
                            .font(.atlas(.serif, 16.5))
                            .foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        HStack(spacing: 3) {
                            ForEach(0..<3, id: \.self) { bar in
                                Capsule()
                                    .fill(bar <= stake ? Palette.accent : Palette.hairlineStrong)
                                    .frame(width: 4, height: CGFloat(6 + bar * 5))
                            }
                        }
                        .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 15)
                    .padding(.vertical, 12)
                    .frame(minHeight: Metrics.tap)
                    .boxed(Palette.card, border: Palette.hairlineStrong, radius: 3)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .pressable()
            }
            Text("Sem certeza não arrisca nada · bastante seguro ganha 2, perde 1 · muito seguro ganha 3, perde 3")
                .font(.atlas(.serif, 13))
                .foregroundStyle(Palette.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private static let sure: [LocalizedStringKey] = ["Não tenho certeza", "Bastante seguro", "Muito seguro"]
}

/// What a section's pretest came to, worn on the section afterwards: that the
/// learner already had it, or that their guess missed and the answer is in the
/// prose below — with the ink the bet won or lost, and, on a miss they were
/// very sure of, why that one matters. Mirrors `PretestMark`.
struct PretestMark: View {
    let known: Bool
    let stake: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(known ? "Você já sabia isto — pode seguir, ou ler mesmo assim."
                       : "Seu palpite antes da leitura errou — a resposta está aqui")
                .font(.atlas(.caps, 12.5))
                .foregroundStyle(known ? Palette.accent : Palette.amberInk)
            if let stake {
                Text(inkCopy(stake, correct: known))
                    .font(.atlas(.caps, 12.5))
                    .foregroundStyle(known ? Palette.accent : Palette.amberInk)
            }
            if !known && stake == 2 {
                ConfidentMiss().padding(.top, 4)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A miss the learner bet "very sure" on — said wherever one lands.
struct ConfidentMiss: View {
    var body: some View {
        Text("Você estava muito seguro. Um erro com certeza é o que mais fixa quando você lê a correção.")
            .font(.atlas(.serif, 15))
            .foregroundStyle(Palette.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// "+3 de tinta", "−1 de tinta", or "nenhuma tinta perdida" on a free bet.
func inkCopy(_ stake: Int, correct: Bool) -> LocalizedStringKey {
    let delta = inkDelta(stake, correct: correct)
    if correct { return "+\(delta) de tinta" }
    return delta < 0 ? "−\(-delta) de tinta" : "nenhuma tinta perdida"
}
