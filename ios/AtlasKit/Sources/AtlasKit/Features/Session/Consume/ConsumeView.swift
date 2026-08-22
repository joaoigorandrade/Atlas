import Navigation
import SwiftUI

/// "Consume" (screen 14) — the reading phase. Sections land one at a time and
/// are read in order; the section's check gates its Continue, and the four
/// lenses open a model view over the prose rather than swapping it underneath
/// the learner.
struct ConsumeView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ConsumeViewModel?

    var body: some View {
        Group {
            if let model {
                content(model)
            } else {
                Waiting("Escrevendo sua leitura…")
            }
        }
        .background(Palette.paper)
        .task {
            let model = model ?? ConsumeViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: ConsumeViewModel) -> some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            PhaseBar(.consume, title: model.node.label, back: { navigator.pop() }) {
                if store.readAloudOn { speaker(model) }
            }

            SegmentBar(model.rail, height: 3)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 10)

            if let chunk = model.chunk {
                ScrollView {
                    section(chunk, model)
                        .padding(.horizontal, Metrics.gutter)
                        .padding(.top, 22)
                        .padding(.bottom, 28)
                }
                .id(chunk.id)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))
                dock(model)
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
            }
        }
        // A section is a page turn, and the check's verdict lands under it.
        .animation(Motion.standard, value: model.index)
        .animation(Motion.snap, value: model.picked)
        .sensoryFeedback(.selection, trigger: model.picked)
        .sheet(item: $model.lens) { key in
            ModelLensView(lens: key, context: model.lensContext(key))
                .presentationDetents([.medium, .large])
                .environment(store)
        }
    }

    private func speaker(_ model: ConsumeViewModel) -> some View {
        Button { model.toggleReadAloud() } label: {
            Image(systemName: model.speaker.speaking ? "speaker.wave.2.fill" : "speaker.wave.2")
                .font(.system(size: 17))
                .foregroundStyle(model.speaker.speaking ? Palette.accent : Palette.inkMuted)
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.variableColor.iterative, isActive: model.speaker.speaking)
                .frame(width: Metrics.tap, height: Metrics.tap)
        }
        .pressable()
        .animation(Motion.snap, value: model.speaker.speaking)
        .accessibilityLabel("Ouvir esta seção")
        .disabled(model.chunk == nil)
        .opacity(model.speaker.loading ? 0.4 : 1)
    }

    // MARK: - One section

    @ViewBuilder
    private func section(_ chunk: ConsumeChunk, _ model: ConsumeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(verbatim: chunk.kicker)
            ForEach(Array(chunk.body.enumerated()), id: \.offset) { _, paragraph in
                Text(verbatim: paragraph)
                    .font(.atlas(.serif, 17.5))
                    .lineSpacing(6)
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 14)
            }

            if let figure = chunk.figure {
                FigureView(figure)
                    .padding(.top, 20)
                if let caption = chunk.diagram {
                    Text(verbatim: caption).font(.atlas(.mono, 10.5)).foregroundStyle(Palette.inkFaint).padding(.top, 8)
                }
            }

            if let example = chunk.example {
                Kicker("Exemplo").padding(.top, 22)
                Text(verbatim: example.title).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink).padding(.top, 8)
                ForEach(Array(example.steps.enumerated()), id: \.offset) { step, text in
                    HStack(alignment: .top, spacing: 10) {
                        Text(verbatim: "\(step + 1)").font(.atlas(.mono, 11)).foregroundStyle(Palette.inkFaint)
                        Text(verbatim: text).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                    }
                    .padding(.top, 8)
                }
            }

            Text(verbatim: chunk.takeaway)
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
                    Button { model.open(key) } label: {
                        Text(key.label)
                            .font(.atlas(.mono, 12))
                            .foregroundStyle(Palette.inkMuted)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(Palette.card, in: .rect(cornerRadius: 8))
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }
                    .pressable()
                }
            }
            .padding(.top, 10)

            if let check = chunk.check { self.check(check, model).padding(.top, 24) }
            if let cite = chunk.cite {
                Text("Leitura complementar · \(cite)")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkFaint)
                    .padding(.top, 22)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func check(_ check: ConsumePrediction, _ model: ConsumeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("Checagem", tint: Palette.accent)
            Text(verbatim: check.q).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
            ForEach(Array(check.opts.enumerated()), id: \.offset) { option, opt in
                Button { model.pick(option) } label: {
                    Text(verbatim: opt.label)
                        .font(.atlas(.sans, 14.5))
                        .foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: Metrics.tap, alignment: .leading)
                        .padding(.horizontal, 14)
                        .background(Palette.card, in: .rect(cornerRadius: 10))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(mark(option, check, model) ?? Palette.hairlineStrong, lineWidth: 1)
                        }
                }
                .pressable()
                .disabled(model.passed)
            }
            if model.picked != nil {
                Text(verbatim: model.passed ? check.right : check.wrong)
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(model.passed ? Palette.accent : Palette.amberInk)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.accentBg, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.accent.opacity(0.18), lineWidth: 1) }
    }

    /// Green marks the answer once it is found, amber the miss that was picked.
    /// A miss doesn't give the answer away — the section is still open, and the
    /// next tap is the retry.
    private func mark(_ option: Int, _ check: ConsumePrediction, _ model: ConsumeViewModel) -> Color? {
        guard let picked = model.picked else { return nil }
        if model.passed { return check.opts[safe: option]?.correct == true ? Palette.accent : nil }
        return picked == option ? Palette.amberInk : nil
    }

    // MARK: - The dock

    private func dock(_ model: ConsumeViewModel) -> some View {
        Dock {
            if let next = model.next {
                CTAButton("Continuar · \(next.kicker)") { model.advance() }
                    .disabled(!model.passed)
                    .opacity(model.passed ? 1 : 0.5)
            } else if model.writing {
                CTAButton("Escrevendo a próxima seção…", tint: Palette.inkGhost) {}
                    .disabled(true)
            } else {
                CTAButton("Seguir para o Socrático →") { model.finish() }
                    .disabled(!model.passed)
                    .opacity(model.passed ? 1 : 0.5)
            }
        }
    }
}
