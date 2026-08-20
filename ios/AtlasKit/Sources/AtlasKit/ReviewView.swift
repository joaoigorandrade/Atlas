import SwiftUI

/// "Revisão" — the daily queue, one card at a time: tap how solid it felt,
/// flip, grade. A miss opens the alive-loop rather than only rescheduling.
public struct ReviewView: View {
    @Environment(AtlasStore.self) private var store
    @State private var review: Review?
    /// Why there is nothing on screen — a clear queue, or an honest failure.
    @State private var message = ""
    @State private var drafting = false
    @State private var session: Session?

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            TopBar {
                VStack(alignment: .leading, spacing: 2) {
                    Kicker("Revisão · retenção", tint: Palette.accent, size: 9.5)
                    Text(store.subject.isEmpty ? "Atlas" : store.subject)
                        .font(.atlas(.serif, 16)).foregroundStyle(Palette.ink).lineLimit(1)
                }
            } trailing: {
                NavigationLink { CalibrationView().environment(store) } label: {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 17))
                        .foregroundStyle(Palette.inkMuted)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                }
                .accessibilityLabel("Calibração")
            }

            if let review, let card = review.card, !review.finished {
                deck(review, card)
                dock(review, card)
            } else {
                Waiting(waitingCopy, spinning: drafting)
            }
        }
        .background(Palette.paper)
        // Keyed on the queue so finishing a deck, or learning a new concept,
        // brings the screen back to life instead of freezing on "fila limpa".
        .task(id: store.queue.count) { await open() }
        // A missed card can re-enter the spiral right here — the same
        // full-screen pass the map pushes.
        #if os(iOS)
        .fullScreenCover(item: $session) { SessionView(session: $0).environment(store) }
        #else
        .sheet(item: $session) { SessionView(session: $0).environment(store) }
        #endif
    }

    private var waitingCopy: String {
        if drafting { return "Escrevendo os cartões de hoje…" }
        if !message.isEmpty { return message }
        return review?.finished == true
            ? "Fila limpa por hoje. Volte amanhã — é quando essas memórias começam a desvanecer."
            : "Nada para revisar ainda. Aprenda um conceito e ele volta aqui."
    }

    /// The queue reads from the cards that exist; a node that has never been
    /// reviewed gets its cards drafted once, and they live here from then on.
    private func open() async {
        if let review, !review.finished { return }
        if !store.queue.isEmpty { return review = Review(deck: store.queue, store: store) }
        let uncovered = store.uncovered
        guard !uncovered.isEmpty, !drafting else { return }
        drafting = true
        defer { drafting = false }
        do {
            let drafted = try await store.api.retain(
                topic: store.subject,
                budgetMin: store.dailyTarget,
                nodes: uncovered.map { ($0.id, $0.label, store.states[$0.id] ?? .learning) },
                interests: store.interests
            )
            store.cards.append(contentsOf: drafted.map { ScheduledCard($0) })
            review = Review(deck: store.queue, store: store)
        } catch {
            message = Onboarding.copy(for: error, doing: "montar sua revisão")
        }
    }

    // MARK: - The deck

    private func deck(_ review: Review, _ card: ScheduledCard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SegmentBar(review.deck.map { review.results[$0.id]?.tint })
                HStack {
                    Kicker("Cartão \(review.index + 1) de \(review.deck.count)", size: 9.5)
                    Spacer()
                    Kicker("~\(review.minutesLeft) min restantes", size: 9.5)
                }
                .padding(.top, 7)

                HStack {
                    Chip(card.card.type.label, tint: card.card.type.tint,
                         background: card.card.type.tint.opacity(0.08))
                    Spacer()
                    Text(card.card.source).font(.atlas(.mono, 11)).foregroundStyle(Palette.inkGhost)
                        .lineLimit(1)
                }
                .padding(.top, 18)

                face(review, card).padding(.top, 12)
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
    }

    /// The card itself, on the two backs the design stacks behind it.
    private func face(_ review: Review, _ card: ScheduledCard) -> some View {
        ZStack(alignment: .top) {
            ForEach(Array([(18.0, 0.956, 0.5), (9.0, 0.978, 0.75)].enumerated()), id: \.offset) { _, back in
                RoundedRectangle(cornerRadius: 18)
                    .fill(Palette.cardAlt)
                    .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Palette.hairline, lineWidth: 1) }
                    .opacity(review.deck.count > review.index + 1 ? back.2 : 0)
                    .scaleEffect(back.1)
                    .offset(y: back.0)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(front(card.card))
                    .font(.atlas(.serif, 22))
                    .foregroundStyle(Palette.ink)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)

                switch review.stage {
                case .confidence:
                    Kicker("Antes de virar", size: 10).padding(.top, 24)
                    HStack(spacing: 8) {
                        ForEach(ReviewConfidence.allCases) { level in
                            Button { review.tap(level) } label: {
                                Text(level.label)
                                    .font(.atlas(.sans, 13.5))
                                    .foregroundStyle(Palette.inkSoft)
                                    .frame(maxWidth: .infinity, minHeight: 48)
                            }
                            .background(Palette.card, in: .rect(cornerRadius: 11))
                            .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                        }
                    }
                    .padding(.top, 10)
                case .reveal:
                    Divider().overlay(Palette.hairline).padding(.vertical, 18)
                    Text(card.card.back)
                        .font(.atlas(.serif, 17))
                        .foregroundStyle(Palette.inkSoft)
                        .lineSpacing(5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                case .failed:
                    failed(review, card).padding(.top, 18)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 26)
            .frame(maxWidth: .infinity, minHeight: 230, alignment: .top)
            .background(Palette.card, in: .rect(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
            .shadow(color: Palette.ink.opacity(0.07), radius: 15, y: 10)
        }
        .animation(Motion.standard, value: review.stage)
    }

    /// A cloze card is its two halves around the blank; everything else asks
    /// its question outright.
    private func front(_ card: ReviewCard) -> String {
        guard let cloze = card.cloze, cloze.count == 2 else { return card.front ?? card.back }
        return cloze[0] + "______" + cloze[1]
    }

    /// The alive-loop: a miss doesn't only reschedule. The node is Shaky on the
    /// map, the re-explanation is right here, and the spiral is one tap away.
    @ViewBuilder
    private func failed(_ review: Review, _ card: ScheduledCard) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("De volta ao ciclo", tint: NodeState.gap.color, size: 10)
            Text(card.card.back)
                .font(.atlas(.serif, 17)).foregroundStyle(Palette.ink).lineSpacing(5)
            if let reExplain = card.card.reExplain {
                Text(reExplain)
                    .font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkSoft).lineSpacing(3)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.dangerBg, in: .rect(cornerRadius: 10))
            }
            Text(review.calibrationLine)
                .font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted).lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - The dock

    @ViewBuilder
    private func dock(_ review: Review, _ card: ScheduledCard) -> some View {
        Dock {
            switch review.stage {
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
                            Button { review.grade(grade) } label: {
                                VStack(spacing: 2) {
                                    Text(grade.label).font(.atlas(.sans, 13, weight: .semibold))
                                    Text(card.label(for: grade)).font(.atlas(.mono, 9.5))
                                }
                                .foregroundStyle(grade.tint)
                                .frame(maxWidth: .infinity, minHeight: Metrics.cta)
                            }
                            .background(Palette.card, in: .rect(cornerRadius: 11))
                            .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(grade.tint, lineWidth: 1) }
                        }
                    }
                }
            case .failed:
                CTAButton("Reensinar agora", tint: NodeState.shaky.color) {
                    guard let node = review.failedNode else { return review.advance() }
                    review.advance()
                    session = Session(node: node, store: store)
                }
                GhostButton("Agendar e continuar") { review.advance() }
            }
        }
    }
}
