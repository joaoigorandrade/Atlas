import Navigation
import SwiftUI

/// "Connect" (screen 17) — the elaboration pass. The learner wires the new
/// concept into ones they already own; each confirmed link is raw material for
/// a review card. On list-like material the same screen also hands them the
/// ordered items and a memory aid for them, which drafts a card of its own.
struct ConnectView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ConnectViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Procurando o que você já sabe…") }
        }
        .background(Palette.paper)
        // The wait and the pass are one screen arriving, not two screens
        // swapping: the shape fades out under the prose that lands over it.
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? ConnectViewModel(session: session)
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
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Kicker("Teia de conceitos")
                            Spacer(minLength: 0)
                            // The gate, counted. A learner cannot plan around a
                            // sentence that says the same thing at zero and at one.
                            Chip(verbatim: "\(model.linked.count)/\(model.required)",
                                 dot: model.ready ? Palette.connectInk : nil,
                                 tint: model.ready ? Palette.connectInk : Palette.inkSoft)
                        }
                        ConceptWeb(content: content, linked: model.linked,
                                   active: model.candidate?.id, select: model.select)
                            .padding(.top, 10)
                            .animation(Motion.standard, value: model.linked)
                        Text(verbatim: content.detectNote)
                            .font(.atlas(.sans, 13))
                            .foregroundStyle(Palette.inkMuted)
                            .padding(.top, 10)
                        prompt(content, model).padding(.top, 20)
                            .id(model.candidate?.id)
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                        // The detector's other branch. The note above says the
                        // material is enumerable; this is what that buys.
                        mnemonics(model).padding(.top, 20)
                        cards(model).padding(.top, 20)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.vertical, 18)
                }
                Dock {
                    VStack(spacing: 8) {
                        if !model.ready {
                            // The node becomes Shaky on the way out, as if the
                            // elaboration happened. Something has to have.
                            Text("Faltam \(model.required - model.linked.count) vínculos para seguir.")
                                .font(.atlas(.sans, 12.5))
                                .foregroundStyle(Palette.inkMuted)
                        }
                        CTAButton("Seguir para o Crisol →", tint: Palette.crucibleInk) { model.advance() }
                            .disabled(!model.ready)
                    }
                }
            } else {
                // A diagram is what lands here, so the wait draws one — prose
                // bars promised a screen this phase never becomes.
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty, shape: .web)
                if model.failed {
                    Dock { CTAButton("Tentar de novo", tint: Palette.connectInk) { Task { await model.retry() } } }
                }
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
                             dictation: model.dictation,
                             minHeight: 88, tint: Palette.connectInk)
                    .padding(.top, 14)
                // Offered, not imposed: the box opens blank, and the map's own
                // sentence is one tap away until there is something of theirs
                // to overwrite.
                if model.canSuggest(candidate) {
                    Button("Ver a sugestão do mapa") { model.suggest(candidate) }
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.connectInk)
                        .padding(.top, 10)
                }
                CTAButton(model.linked.contains(candidate.id) ? "Reescrever o vínculo" : "Confirmar vínculo",
                          tint: Palette.connectInk) {
                    model.dictation.flush()
                    model.confirm(candidate)
                }
                    .padding(.top, 12)
                    .disabled(!model.canConfirm(candidate))
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.connectBg, in: .rect(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.connectBorder, lineWidth: 1) }
        }
    }

    // MARK: - The memory aid (list-like content only)

    /// Elaboration wires a concept in; it does nothing for an order you have to
    /// reproduce. When the generation detects one, the items and the aids it
    /// drafted for them belong on the same screen — the server writes both on
    /// every list-like node whether or not anything draws them.
    @ViewBuilder
    private func mnemonics(_ model: ConnectViewModel) -> some View {
        let options = model.mnemonics
        if !options.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("Ancorar a sequência", tint: Palette.connectInk)
                Text("Isto é uma ordem para reproduzir, não só uma ideia para conectar. Escolha um apoio e ajuste com suas palavras.")
                    .font(.atlas(.sans, 13))
                    .foregroundStyle(Palette.inkMuted)
                    .padding(.top, 8)
                if !model.items.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(model.items.enumerated()), id: \.offset) { index, item in
                            HStack(alignment: .firstTextBaseline, spacing: 9) {
                                Text(verbatim: "\(index + 1)")
                                    .font(.atlas(.mono, 12))
                                    .foregroundStyle(Palette.connectInk)
                                    .frame(width: 18, alignment: .trailing)
                                Text(verbatim: item)
                                    .font(.atlas(.serif, 14.5))
                                    .foregroundStyle(Palette.ink)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Palette.card, in: .rect(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    .padding(.top, 12)
                }
                ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                    let picked = model.mnemonicPick == index
                    Button { model.pick(index) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            if let name = ConnectViewModel.toolName(option.kind) {
                                Kicker(name, tint: picked ? Palette.connectInk : Palette.inkFaint)
                            } else {
                                Kicker(verbatim: option.kind,
                                       tint: picked ? Palette.connectInk : Palette.inkFaint)
                            }
                            Text(verbatim: option.title)
                                .font(.atlas(.serif, 15.5))
                                .foregroundStyle(Palette.ink)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(picked ? Palette.connectBg : Palette.card, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12).strokeBorder(
                                picked ? Palette.connectInk : Palette.hairlineStrong,
                                lineWidth: picked ? 2 : 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                }
                if model.mnemonicPick != nil {
                    AnswerEditor(text: model.mnemonic,
                                 placeholder: String(localized: "Ajuste o apoio com suas palavras…"),
                                 dictation: model.dictation,
                                 minHeight: 76, tint: Palette.connectInk)
                        .padding(.top, 12)
                    CTAButton(model.mnemonicAccepted ? "Apoio guardado ✓" : "Guardar este apoio",
                              tint: Palette.connectInk) {
                        model.dictation.flush()
                        model.acceptMnemonic()
                    }
                        .padding(.top, 12)
                        .disabled(model.mnemonicAccepted)
                }
            }
            .padding(.top, 18)
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        }
    }

    @ViewBuilder
    private func cards(_ model: ConnectViewModel) -> some View {
        let confirmed = model.confirmed
        let count = confirmed.count + (model.mnemonicAccepted ? 1 : 0)
        if count > 0 {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Kicker("Matéria-prima")
                    Text("\(count) cartões rascunhados")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                }
                ForEach(confirmed) { candidate in
                    draftedCard(front: model.front(for: candidate), back: model.back(for: candidate))
                }
                if model.mnemonicAccepted {
                    draftedCard(front: model.mnemonicFront, back: model.mnemonic.wrappedValue)
                }
            }
            .padding(.top, 18)
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        }
    }

    /// A card, drawn as one. Printing only the back gave the learner their own
    /// sentence back with no question over it — the phase's promised product
    /// looked like an echo rather than a card waiting in the queue.
    private func draftedCard(front: String, back: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(verbatim: front)
                .font(.atlas(.sans, 12.5))
                .foregroundStyle(Palette.inkMuted)
            Text(verbatim: back)
                .font(.atlas(.serif, 14.5))
                .foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 15).padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}

/// One node on the web. A capsule sized by its own label, because a label is
/// wider than any fixed dot: the old fixed-radius circle drew unlinked
/// candidates invisibly (card on card, no border) and clipped a linked one's
/// white text off the edge of the canvas.
private struct WebNode: View {
    let label: String
    let on: Bool
    let focused: Bool
    let centre: Bool
    let cap: CGFloat

    var body: some View {
        Text(verbatim: label)
            .font(.atlas(.serif, centre ? 13 : 12))
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.75)
            .foregroundStyle(on ? Palette.accentInk : (centre ? Palette.ink : Palette.inkMuted))
            .frame(maxWidth: cap)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(on ? Palette.connectInk : (centre ? Palette.connectBg : Palette.card), in: .capsule)
            .overlay {
                Capsule().strokeBorder(
                    focused ? Palette.connectInk : (on ? .clear : Palette.hairlineStrong),
                    lineWidth: focused ? 2 : 1)
            }
    }
}

/// The candidates around the node, at the coordinates the generation chose. A
/// confirmed link is drawn solid in the phase's violet; the rest stay dashed,
/// which is the design's whole legend — and the one being asked about carries
/// the ring, so the prompt and the diagram are talking about the same node.
private struct ConceptWeb: View {
    let content: ElaborationContent
    let linked: Set<String>
    let active: String?
    let select: @MainActor (ElaborationLink) -> Void

    /// The widest a node may draw, as a share of the canvas.
    private static let cap = 0.36

    /// The generation places its candidates in a 560×440 canvas, and a node is
    /// as wide as its label — so a slot near an edge is pulled in by half of
    /// the widest a node may be. Edges are drawn to the same clamped point, or
    /// a line ends where no node is.
    private func place(_ x: Double, _ y: Double, in size: CGSize) -> CGPoint {
        let scale = size.width / 560
        let inset = size.width * Self.cap / 2 + 8
        return CGPoint(x: min(max(x * scale, inset), size.width - inset),
                       y: min(max(y * scale, 24), size.height - 24))
    }

    var body: some View {
        GeometryReader { geo in
            let cap = geo.size.width * Self.cap
            ZStack {
                // Only the edges are drawn here. The nodes are real views, which
                // is what gives them a hit target, a size that fits their label
                // and an accessibility element — a Canvas has none of the three.
                Canvas { context, size in
                    let centre = place(content.center.x, content.center.y, in: size)
                    for candidate in content.cands {
                        var path = Path()
                        path.move(to: centre)
                        path.addLine(to: place(candidate.x, candidate.y, in: size))
                        let on = linked.contains(candidate.id)
                        context.stroke(path,
                                       with: .color(on ? Palette.connectInk : Palette.ink.opacity(0.16)),
                                       style: StrokeStyle(lineWidth: on ? 2 : 1.3, dash: on ? [] : [4, 5]))
                    }
                }
                .accessibilityHidden(true)

                ForEach(content.cands) { candidate in
                    Button { select(candidate) } label: {
                        WebNode(label: candidate.label, on: linked.contains(candidate.id),
                                focused: candidate.id == active, centre: false, cap: cap)
                    }
                    .buttonStyle(.plain)
                    .position(place(candidate.x, candidate.y, in: geo.size))
                    .accessibilityLabel(Text(verbatim: candidate.label))
                    .accessibilityValue(linked.contains(candidate.id)
                                        ? Text("Vinculado") : Text("Sem vínculo"))
                    .accessibilityAddTraits(candidate.id == active ? [.isSelected] : [])
                }

                // The prompt names the centre in a full sentence; VoiceOver does
                // not need it a second time as a bare label.
                WebNode(label: content.centerLabel, on: false, focused: false, centre: true, cap: cap)
                    .position(place(content.center.x, content.center.y, in: geo.size))
                    .accessibilityHidden(true)
            }
        }
        .aspectRatio(560.0 / 440.0, contentMode: .fit)
        .padding(8)
        .background(Palette.card, in: .rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
