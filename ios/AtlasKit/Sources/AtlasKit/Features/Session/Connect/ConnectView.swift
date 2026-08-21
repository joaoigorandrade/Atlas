import Navigation
import SwiftUI

/// "Connect" (screen 17) — the elaboration pass. The learner wires the new
/// concept into ones they already own; each confirmed link is raw material for
/// a review card.
///
/// ponytail: the mnemonic half (list-like content) isn't here — the design's
/// mobile artboard draws the conceptual pass only. Add it when screen 19 needs
/// the aids it drafts.
struct ConnectView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ConnectViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Waiting("Procurando o que você já sabe…") }
        }
        .background(Palette.paper)
        .task {
            let model = model ?? ConnectViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: ConnectViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.connect, title: model.node.label, back: { navigator.pop() })

            if let content = model.content {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Kicker("Teia de conceitos")
                        ConceptWeb(content: content, linked: model.linked).padding(.top, 10)
                            .animation(Motion.standard, value: model.linked)
                        Text(verbatim: content.detectNote)
                            .font(.atlas(.sans, 13))
                            .foregroundStyle(Palette.inkMuted)
                            .padding(.top, 10)
                        prompt(content, model).padding(.top, 20)
                            .id(model.candidate?.id)
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                        cards(model).padding(.top, 20)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.vertical, 18)
                }
                Dock {
                    CTAButton("Seguir para o Crisol →", tint: Palette.crucibleInk) { model.advance() }
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
            }
        }
        // A confirmed link lights its edge on the web and drops a card below —
        // the two have to happen together or the cause is lost.
        .animation(Motion.standard, value: model.linked)
        .sensoryFeedback(.success, trigger: model.linked.count)
    }

    // MARK: - The linking prompt

    @ViewBuilder
    private func prompt(_ content: ElaborationContent, _ model: ConnectViewModel) -> some View {
        if let candidate = model.candidate {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("Faça o vínculo", tint: Palette.connectInk)
                Text("Como \(content.centerLabel) se relaciona com \(candidate.label)?")
                    .font(.atlas(.serif, 17))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 9)
                AnswerEditor(text: model.draft(candidate),
                             placeholder: String(localized: "Escreva o vínculo com suas palavras…"),
                             minHeight: 88, tint: Palette.connectInk)
                    .padding(.top, 14)
                CTAButton("Confirmar vínculo", tint: Palette.connectInk) { model.confirm(candidate) }
                    .padding(.top, 12)
                    .disabled(!model.canConfirm(candidate))
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.connectBg, in: .rect(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.connectBorder, lineWidth: 1) }
        }
    }

    @ViewBuilder
    private func cards(_ model: ConnectViewModel) -> some View {
        let confirmed = model.confirmed
        if !confirmed.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Kicker("Matéria-prima")
                    Text("\(confirmed.count) cartões rascunhados")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                }
                ForEach(confirmed) { candidate in
                    Text(verbatim: model.text(for: candidate))
                        .font(.atlas(.serif, 14.5))
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 15).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.card, in: .rect(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .padding(.top, 18)
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        }
    }
}

/// The candidates around the node, at the coordinates the generation chose. A
/// confirmed link is drawn solid in the phase's violet; the rest stay dashed,
/// which is the design's whole legend.
private struct ConceptWeb: View {
    let content: ElaborationContent
    let linked: Set<String>

    var body: some View {
        Canvas { context, size in
            let scale = size.width / 560
            func place(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * scale, y: y * scale) }
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
                context.draw(Text(verbatim: candidate.label).font(.atlas(.serif, 11))
                    .foregroundStyle(on ? Palette.accentInk : Palette.inkMuted), at: point)
            }
            let radius: CGFloat = 30 * scale + 10
            context.fill(Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius,
                                                width: radius * 2, height: radius * 2)),
                         with: .color(Palette.connectBg))
            context.draw(Text(verbatim: content.centerLabel).font(.atlas(.serif, 12)).foregroundStyle(Palette.ink), at: centre)
        }
        .frame(height: 190)
        .padding(8)
        .background(Palette.card, in: .rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
