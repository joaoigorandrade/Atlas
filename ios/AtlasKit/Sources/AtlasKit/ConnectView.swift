import SwiftUI

/// "Connect" (screen 17) — the elaboration pass. The learner wires the new
/// concept into ones they already own; the candidates are real nodes off their
/// own map, so every link is true rather than trivia. Each confirmed link is
/// raw material for a review card.
///
/// ponytail: the mnemonic half (list-like content) isn't here — the design's
/// mobile artboard draws the conceptual pass only. Add it when screen 19 needs
/// the aids it drafts.
struct ConnectView: View {
    let session: Session
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var content: ElaborationContent?
    @State private var active: String?
    @State private var drafts: [String: String] = [:]
    @State private var linked: Set<String> = []
    @State private var message = ""

    var body: some View {
        VStack(spacing: 0) {
            PhaseBar(.connect, title: session.node.label, back: { dismiss() })

            if let content {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Kicker("Teia de conceitos")
                        web(content).padding(.top, 10)
                        Text(content.detectNote)
                            .font(.atlas(.sans, 13))
                            .foregroundStyle(Palette.inkMuted)
                            .padding(.top, 10)
                        prompt(content).padding(.top, 20)
                        cards(content).padding(.top, 20)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.vertical, 18)
                }
                Dock {
                    CTAButton("Seguir para o Crisol →", tint: Palette.crucibleInk) {
                        session.finishConnect()
                        session.advance()
                    }
                }
            } else {
                Waiting(message.isEmpty ? "Procurando o que você já sabe…" : message, spinning: message.isEmpty)
            }
        }
        .background(Palette.paper)
        .task { await load() }
    }

    // MARK: - The web

    /// The candidates around the node, at the coordinates the generation chose.
    /// A confirmed link is drawn solid in the phase's violet; the rest stay
    /// dashed, which is the design's whole legend.
    private func web(_ content: ElaborationContent) -> some View {
        Canvas { context, size in
            let scale = size.width / 560
            let place = { (x: Double, y: Double) in
                CGPoint(x: x * scale, y: y * scale)
            }
            let centre = place(content.center.x, content.center.y)
            for candidate in content.cands {
                var path = Path()
                path.move(to: centre)
                path.addLine(to: place(candidate.x, candidate.y))
                let on = linked.contains(candidate.id)
                context.stroke(path,
                               with: .color(on ? Palette.connectInk : Palette.ink.opacity(0.16)),
                               style: StrokeStyle(lineWidth: on ? 2 : 1.3, dash: on ? [] : [4, 5]))
            }
            for candidate in content.cands {
                let point = place(candidate.x, candidate.y)
                let on = linked.contains(candidate.id)
                let radius: CGFloat = 23 * scale + 8
                context.fill(Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius,
                                                    width: radius * 2, height: radius * 2)),
                             with: .color(on ? Palette.connectInk : Palette.card))
                context.draw(Text(candidate.label).font(.atlas(.serif, 11))
                    .foregroundStyle(on ? Palette.accentInk : Palette.inkMuted), at: point)
            }
            let radius: CGFloat = 30 * scale + 10
            context.fill(Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius,
                                                width: radius * 2, height: radius * 2)),
                         with: .color(Palette.connectBg))
            context.draw(Text(content.centerLabel).font(.atlas(.serif, 12)).foregroundStyle(Palette.ink), at: centre)
        }
        .frame(height: 190)
        .padding(8)
        .background(Palette.card, in: .rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    // MARK: - The linking prompt

    @ViewBuilder
    private func prompt(_ content: ElaborationContent) -> some View {
        let candidate = content.cands.first { $0.id == active } ?? content.cands.first { !linked.contains($0.id) }
        if let candidate {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("Faça o vínculo", tint: Palette.connectInk)
                Text("Como \(content.centerLabel) se relaciona com \(candidate.label)?")
                    .font(.atlas(.serif, 17))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 9)
                AnswerEditor(text: draft(candidate), placeholder: "Escreva o vínculo com suas palavras…",
                             minHeight: 88, tint: Palette.connectInk)
                    .padding(.top, 14)
                CTAButton("Confirmar vínculo", tint: Palette.connectInk) {
                    linked.insert(candidate.id)
                    active = content.cands.first { !linked.contains($0.id) }?.id
                }
                .padding(.top, 12)
                .disabled((drafts[candidate.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.connectBg, in: .rect(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.connectBorder, lineWidth: 1) }
        }
    }

    /// The relationship draft, seeded from the map's own phrasing — the learner
    /// accepts it or writes over it.
    private func draft(_ candidate: ElaborationLink) -> Binding<String> {
        Binding(
            get: { drafts[candidate.id] ?? candidate.rel },
            set: { drafts[candidate.id] = $0 }
        )
    }

    @ViewBuilder
    private func cards(_ content: ElaborationContent) -> some View {
        if !linked.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Kicker("Matéria-prima")
                    Text("\(linked.count) cartões rascunhados")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                }
                ForEach(content.cands.filter { linked.contains($0.id) }) { candidate in
                    Text(drafts[candidate.id] ?? candidate.rel)
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 15).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.card, in: .rect(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                }
            }
            .padding(.top, 18)
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        }
    }

    private func load() async {
        let pool = session.learnedElsewhere
        guard !pool.isEmpty else {
            // Nothing owned yet is nothing true to wire into: the phase has no
            // material, so it hands the node straight on rather than asking the
            // learner to link concepts they have never met.
            session.finishConnect()
            return session.advance()
        }
        var context = session.context
        context["pool"] = .array(pool.map { .object(["id": .string($0.id), "label": .string($0.label)]) })
        do {
            content = try await store.api.connect(context)
        } catch {
            message = Onboarding.copy(for: error, doing: "montar sua teia")
        }
    }
}
