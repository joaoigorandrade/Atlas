import Navigation
import SwiftUI

/// "Revisão" — the daily queue, one card at a time: tap how solid it felt,
/// flip, grade. A miss opens the alive-loop rather than only rescheduling.
public struct ReviewView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @State private var model: ReviewViewModel?

    public init() {}

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        // Deliberately unkeyed. This used to be keyed on `store.cards.count` so
        // a new concept would bring the screen back — but drafting cards *is*
        // what changes that count, so SwiftUI cancelled the task mid-draft:
        // the PUT that files the cards died 8ms in, and the restarted pass then
        // read an empty deck back off the server and settled on "fila limpa".
        // Re-entering the tab runs this again, which is the same refresh.
        .task {
            let model = model ?? ReviewViewModel(store: store)
            self.model = model
            await model.open()
        }
    }

    @ViewBuilder
    private func content(_ model: ReviewViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                VStack(alignment: .leading, spacing: 2) {
                    Kicker("Revisão · retenção", tint: Palette.accent, size: 9.5)
                    Text(verbatim: store.subject.isEmpty ? "Atlas" : store.subject)
                        .font(.atlas(.serif, 16)).foregroundStyle(Palette.ink).lineLimit(1)
                }
            } trailing: {
                Button { navigator.navigate(to: .calibration) } label: {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 17))
                        .foregroundStyle(Palette.inkMuted)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                }
                .accessibilityLabel("Calibração")
            }

            if let card = model.card, model.hasCard {
                deck(model, card)
                dock(model, card)
            } else if model.drafting {
                Waiting(verbatim: model.waitingCopy)
            } else {
                resting(model)
            }
        }
        // The deck moving on is the screen's one motion: the answered card
        // leaves left, the next one arrives from the right.
        .animation(Motion.standard, value: model.index)
        .animation(Motion.standard, value: model.hasCard)
        .sensoryFeedback(.selection, trigger: model.stage)
    }

    // MARK: - Nothing on the deck

    /// The three ways this screen can be empty — a finished pass, a queue with
    /// nothing due, a failure — none of which is a blank screen with a grey
    /// sentence in the middle of it. What the learner gets instead is what the
    /// scheduler actually knows: what the pass was worth, when the next card
    /// comes back, and how the whole rotation is holding.
    private func resting(_ model: ReviewViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker(model.gradedCount > 0 ? "Terminado por hoje" : "Revisão",
                       tint: model.gradedCount > 0 ? Palette.accent : Palette.inkFaint, size: 10)
                Text(verbatim: model.waitingCopy)
                    .font(.atlas(.serif, 24))
                    .foregroundStyle(Palette.ink)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)

                if let next = model.nextDueCopy {
                    Text(verbatim: next)
                        .font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkMuted)
                        .padding(.top, 10)
                }

                if model.canRetry {
                    CTAButton("Tentar de novo", tint: Palette.accent) {
                        Task { await model.retry() }
                    }
                    .padding(.top, 20)
                }

                if model.gradedCount > 0 { tally(model).padding(.top, 22) }
                // Only while it is still true: the forecast is the server's
                // count as of the deck load, so a pass that has just cleared
                // cards would be reading it back stale.
                if !model.forecast.isEmpty, model.gradedCount == 0 {
                    health(model).padding(.top, 24)
                }

                if model.gradedCount > 0 {
                    GhostButton("Voltar ao mapa") { tabs.switchTab(to: .map) }
                        .padding(.top, 22)
                }
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 28)
            .padding(.bottom, 32)
        }
    }

    /// What the pass was worth — the counts, the streak, and the one line the
    /// confidence taps finally say out loud.
    private func tally(_ model: ReviewViewModel) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                figure("\(model.recalledCount)/\(model.gradedCount)",
                       "recordados", Palette.accent)
                figure("\(store.streak)", "dias seguidos", Palette.amberInk)
            }
            if let verdict = model.passVerdict {
                Text(verbatim: verdict)
                    .font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkMuted).lineSpacing(3)
            }
        }
    }

    private func figure(_ value: String, _ label: LocalizedStringKey, _ tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(verbatim: value).font(.atlas(.serif, 26)).foregroundStyle(tint)
            Kicker(label, size: 9.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    /// The FSRS forecast the deck endpoint already answers with, and which this
    /// client fetched and threw away until now. Due now · this week · consolidated.
    private func health(_ model: ReviewViewModel) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Kicker("Saúde da retenção · previsão FSRS", size: 9.5)
            ForEach(model.forecast) { row in
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 4).fill(row.tint).frame(width: 8)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(verbatim: row.label).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: row.count).font(.atlas(.serif, 15)).foregroundStyle(Palette.ink)
                        }
                        Text(verbatim: row.sub)
                            .font(.atlas(.sans, 12)).foregroundStyle(Palette.inkFaint).lineSpacing(2)
                    }
                }
                .frame(minHeight: 34)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.cardAlt, in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairline, lineWidth: 1) }
    }

    // MARK: - The deck

    private func deck(_ model: ReviewViewModel, _ card: ReviewCard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SegmentBar(model.rail)
                HStack {
                    Kicker("Cartão \(model.index + 1) de \(model.deck.count)", size: 9.5)
                    Spacer()
                    Kicker("~\(model.minutesLeft) min restantes", size: 9.5)
                }
                .padding(.top, 7)

                HStack {
                    Chip(card.type.label, tint: card.type.tint,
                         background: card.type.tint.opacity(0.08))
                    Spacer()
                    Text(verbatim: card.source).font(.atlas(.mono, 11)).foregroundStyle(Palette.inkGhost)
                        .lineLimit(1)
                }
                .padding(.top, 18)

                face(model, card).padding(.top, 12)
                    .id(card.id)
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
    }

    /// The card itself, on the two backs the design stacks behind it.
    private func face(_ model: ReviewViewModel, _ card: ReviewCard) -> some View {
        ZStack(alignment: .top) {
            ForEach(Array([(18.0, 0.956, 0.5), (9.0, 0.978, 0.75)].enumerated()), id: \.offset) { _, back in
                RoundedRectangle(cornerRadius: 18)
                    .fill(Palette.cardAlt)
                    .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Palette.hairline, lineWidth: 1) }
                    .opacity(model.deck.count > model.index + 1 ? back.2 : 0)
                    .scaleEffect(back.1)
                    .offset(y: back.0)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: model.front(card))
                    .font(.atlas(.serif, 22))
                    .foregroundStyle(Palette.ink)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)

                switch model.stage {
                case .confidence:
                    Kicker("Antes de virar", size: 10).padding(.top, 24)
                    HStack(spacing: 8) {
                        ForEach(ReviewConfidence.allCases) { level in
                            Button { model.tap(level) } label: {
                                Text(level.label)
                                    .font(.atlas(.sans, 13.5))
                                    .foregroundStyle(Palette.inkSoft)
                                    .frame(maxWidth: .infinity, minHeight: 48)
                                    .background(Palette.card, in: .rect(cornerRadius: 11))
                                    .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                            }
                            .pressable()
                        }
                    }
                    .padding(.top, 10)
                case .reveal:
                    Divider().overlay(Palette.hairline).padding(.vertical, 18)
                    Text(verbatim: card.back)
                        .font(.atlas(.serif, 17))
                        .foregroundStyle(Palette.inkSoft)
                        .lineSpacing(5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                case .failed:
                    failed(model, card).padding(.top, 18)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 26)
            .frame(maxWidth: .infinity, minHeight: 230, alignment: .top)
            .background(Palette.card, in: .rect(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
            .shadow(color: Palette.ink.opacity(0.07), radius: 15, y: 10)
        }
        .animation(Motion.standard, value: model.stage)
    }

    /// The alive-loop: a miss doesn't only reschedule. The node is Shaky on the
    /// map, the re-explanation is right here, and the spiral is one tap away.
    private func failed(_ model: ReviewViewModel, _ card: ReviewCard) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("De volta ao ciclo", tint: NodeState.gap.color, size: 10)
            Text(verbatim: card.back)
                .font(.atlas(.serif, 17)).foregroundStyle(Palette.ink).lineSpacing(5)
            if let reExplain = card.reExplain {
                Text(verbatim: reExplain)
                    .font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkSoft).lineSpacing(3)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.dangerBg, in: .rect(cornerRadius: 10))
            }
            Text(model.calibrationLine)
                .font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted).lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - The dock

    @ViewBuilder
    private func dock(_ model: ReviewViewModel, _ card: ReviewCard) -> some View {
        Dock {
            switch model.stage {
            case .confidence:
                Text("Diga como se sente antes de virar — é o toque que constrói sua curva de calibração.")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkFaint)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            case .reveal:
                VStack(alignment: .leading, spacing: 9) {
                    Kicker("Como foi?", size: 10)
                    HStack(spacing: 7) {
                        ForEach(ReviewGrade.allCases) { grade in
                            Button { model.grade(grade) } label: {
                                VStack(spacing: 2) {
                                    Text(grade.label).font(.atlas(.sans, 13, weight: .semibold))
                                    // The real interval, written by the same
                                    // scheduler that will apply it. A card that
                                    // arrived without one shows the grade alone
                                    // rather than a made-up number.
                                    if let interval = card.label(for: grade) {
                                        Text(verbatim: interval).font(.atlas(.mono, 9.5))
                                    }
                                }
                                .foregroundStyle(grade.tint)
                                .frame(maxWidth: .infinity, minHeight: Metrics.cta)
                                .background(Palette.card, in: .rect(cornerRadius: 11))
                                .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(grade.tint, lineWidth: 1) }
                            }
                            .pressable()
                        }
                    }
                }
            case .failed:
                CTAButton("Reensinar agora", tint: NodeState.shaky.color) {
                    guard let node = model.failedNode else { return model.advance() }
                    // The other two entry points warm before they push; a
                    // session started from Review was always cold.
                    if let kind = store.owedPhase(node).kind { store.warmUp(kind, for: node) }
                    model.advance()
                    navigator.navigate(to: .session(node, phase: nil))
                }
                GhostButton("Agendar e continuar") { model.advance() }
            }
        }
    }
}
