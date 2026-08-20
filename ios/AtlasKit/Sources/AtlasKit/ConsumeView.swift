import SwiftUI

/// "Consume" (screen 14) — the reading phase. Sections land one at a time and
/// are read in order; the section's check gates its Continue, and the four
/// lenses open a model view over the prose rather than swapping it underneath
/// the learner.
struct ConsumeView: View {
    let session: Session
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var chunks: [ConsumeChunk] = []
    @State private var writing = true
    @State private var index = 0
    /// The check's picked option for the section on screen — reset per section.
    @State private var picked: Int?
    @State private var lens: AltKey?
    @State private var message = ""
    @State private var speaker = Speaker()

    private var chunk: ConsumeChunk? { chunks[safe: index] }
    /// A section closes on its check: getting it right is what earns Continue.
    private var passed: Bool {
        guard let check = chunk?.check else { return true }
        guard let picked else { return false }
        return check.opts[safe: picked]?.correct == true
    }

    var body: some View {
        VStack(spacing: 0) {
            PhaseBar(.consume, title: session.node.label, back: { dismiss() }) {
                if store.readAloudOn {
                    Button { speaker.toggle(spoken, api: store.api) } label: {
                        Image(systemName: speaker.speaking ? "speaker.wave.2.fill" : "speaker.wave.2")
                            .font(.system(size: 17))
                            .foregroundStyle(speaker.speaking ? Palette.accent : Palette.inkMuted)
                            .frame(width: Metrics.tap, height: Metrics.tap)
                    }
                    .accessibilityLabel("Ouvir esta seção")
                    .disabled(chunk == nil)
                    .opacity(speaker.loading ? 0.4 : 1)
                }
            }

            SegmentBar(chunks.indices.map { $0 < index ? Palette.accent : ($0 == index ? NodeState.frontier.color : nil) },
                       height: 3)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 10)

            if let chunk {
                ScrollView {
                    section(chunk)
                        .padding(.horizontal, Metrics.gutter)
                        .padding(.top, 22)
                        .padding(.bottom, 28)
                }
                .id(chunk.id)
            } else {
                Waiting(message.isEmpty ? "Escrevendo sua leitura…" : message, spinning: message.isEmpty)
            }

            if chunk != nil { dock }
        }
        .background(Palette.paper)
        .sheet(item: $lens) { key in
            ModelSheet(session: session, chunk: chunk, lens: key)
                .presentationDetents([.medium, .large])
                .environment(store)
        }
        .task { await load() }
    }

    // MARK: - One section

    @ViewBuilder
    private func section(_ chunk: ConsumeChunk) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(chunk.kicker)
            ForEach(Array(chunk.body.enumerated()), id: \.offset) { _, paragraph in
                Text(paragraph)
                    .font(.atlas(.serif, 17.5))
                    .lineSpacing(6)
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 14)
            }

            if let figure = chunk.figure {
                FigureView(figure)
                    .padding(.top, 20)
                if let caption = chunk.diagram {
                    Text(caption).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 8)
                }
            }

            if let example = chunk.example {
                Kicker("Exemplo").padding(.top, 22)
                Text(example.title).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink).padding(.top, 8)
                ForEach(Array(example.steps.enumerated()), id: \.offset) { step, text in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(step + 1)").font(.atlas(.mono, 11)).foregroundStyle(Palette.inkFaint)
                        Text(text).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                    }
                    .padding(.top, 8)
                }
            }

            Text(chunk.takeaway)
                .font(.atlas(.serif, 16))
                .foregroundStyle(Palette.ink)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.accentBg, in: .rect(cornerRadius: 10))
                .padding(.top, 20)

            Kicker("Ver de outro jeito").padding(.top, 24)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8, alignment: .leading)],
                      alignment: .leading, spacing: 8) {
                ForEach(AltKey.allCases) { key in
                    Button { lens = key } label: {
                        Text(key.label)
                            .font(.atlas(.mono, 12))
                            .foregroundStyle(Palette.inkMuted)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(Palette.card, in: .rect(cornerRadius: 8))
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }
                }
            }
            .padding(.top, 10)

            if let check = chunk.check { self.check(check).padding(.top, 24) }
            if let cite = chunk.cite {
                Text("Leitura complementar · \(cite)")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkFaint)
                    .padding(.top, 22)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func check(_ check: ConsumePrediction) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("Checagem", tint: Palette.accent)
            Text(check.q).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
            ForEach(Array(check.opts.enumerated()), id: \.offset) { option, opt in
                Button { if picked == nil { picked = option } } label: {
                    Text(opt.label)
                        .font(.atlas(.sans, 14.5))
                        .foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: Metrics.tap, alignment: .leading)
                        .padding(.horizontal, 14)
                        .background(Palette.card, in: .rect(cornerRadius: 10))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(mark(option, check) ?? Palette.hairlineStrong, lineWidth: 1)
                        }
                }
                .disabled(picked != nil)
            }
            if picked != nil {
                Text(passed ? check.right : check.wrong)
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(passed ? Palette.accent : Palette.amberInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.accentBg, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.accent.opacity(0.18), lineWidth: 1) }
    }

    /// Green marks the answer once one is picked, amber the miss that was
    /// picked. An option nobody chose says nothing.
    private func mark(_ option: Int, _ check: ConsumePrediction) -> Color? {
        guard picked != nil else { return nil }
        if check.opts[safe: option]?.correct == true { return Palette.accent }
        return picked == option ? Palette.amberInk : nil
    }

    // MARK: - The dock

    private var dock: some View {
        Dock {
            if let next = chunks[safe: index + 1] {
                CTAButton("Continuar · \(next.kicker)") { advance() }
                    .disabled(!passed)
                    .opacity(passed ? 1 : 0.5)
            } else if writing {
                CTAButton("Escrevendo a próxima seção…", tint: Palette.inkGhost) {}
                    .disabled(true)
            } else {
                CTAButton("Seguir para o Socrático →") {
                    guard passed else { return }
                    session.advance()
                }
                .disabled(!passed)
                .opacity(passed ? 1 : 0.5)
            }
        }
    }

    private func advance() {
        speaker.stop()
        withAnimation(Motion.standard) {
            index += 1
            picked = nil
        }
    }

    /// The prose as it is spoken — the section on screen, nothing around it.
    private var spoken: String { chunk?.body.joined(separator: " ") ?? "" }

    private func load() async {
        do {
            for try await landed in await store.api.consume(session.context) { chunks = landed }
        } catch {
            message = Onboarding.copy(for: error, doing: "escrever sua leitura")
        }
        writing = false
    }
}

/// A section's schematic figure: layered boxes, wired downwards. The layers
/// come from `figureLayers`, so a model-authored cycle draws flat instead of
/// hanging.
struct FigureView: View {
    private let figure: ConsumeFigure
    private let rows: [[ConsumeFigure.Node]]

    init(_ figure: ConsumeFigure) {
        self.figure = figure
        let layers = figureLayers(figure)
        rows = Dictionary(grouping: figure.nodes) { layers[$0.id] ?? 0 }
            .sorted { $0.key < $1.key }
            .map(\.value)
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { row, layer in
                if row > 0 {
                    Image(systemName: "arrow.down")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.inkGhost)
                        .padding(.vertical, 7)
                }
                HStack(spacing: 8) {
                    ForEach(layer) { node in
                        Text(node.label)
                            .font(.atlas(.sans, 12.5))
                            .foregroundStyle(Palette.inkSoft)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 11).padding(.vertical, 9)
                            .background(Palette.cardAlt, in: .rect(cornerRadius: 8))
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairline, lineWidth: 1) }
    }
}
