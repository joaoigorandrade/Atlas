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
        .animation(Motion.standard, value: model.picked)
        .animation(Motion.standard, value: model.missed)
        // A right answer and a miss are different events, and the wrist is the
        // one place the learner reads them without looking.
        .sensoryFeedback(trigger: model.grade) { _, new in
            guard let new else { return nil }
            return new.correct ? SensoryFeedback.success : SensoryFeedback.warning
        }
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
        VStack(alignment: .leading, spacing: 0) {
            // The card says which of its two jobs it is doing: it is in the way
            // until the answer is found, and a receipt after.
            HStack(spacing: 6) {
                Kicker("Checagem", tint: model.passed ? Palette.accent : Palette.inkMuted)
                Spacer(minLength: 0)
                if model.passed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.accent)
                    Kicker("Entendido", tint: Palette.accent)
                }
            }

            Text(verbatim: check.q)
                .font(.atlas(.serif, 17.5))
                .lineSpacing(4)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            // Why the check is in the way at all. It goes once it has been
            // answered — by then the band under the options is the thing to read.
            if model.grade == nil {
                Text("Responda com o que você acabou de ler — isso libera a próxima seção.")
                    .font(.atlas(.sans, 12.5))
                    .lineSpacing(2)
                    .foregroundStyle(Palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            VStack(spacing: 9) {
                ForEach(Array(check.opts.enumerated()), id: \.offset) { option, opt in
                    ChoiceRow(opt.label,
                              mark: mark(option, check, model),
                              chosen: model.picked == option,
                              enabled: !model.passed && !model.missed.contains(option)) {
                        model.pick(option)
                    }
                }
            }
            .padding(.top, 14)

            if let grade = model.grade {
                self.verdict(grade.correct, check)
                    .padding(.top, 14)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.accentBg, in: .rect(cornerRadius: Metrics.cardRadius))
        .overlay {
            RoundedRectangle(cornerRadius: Metrics.cardRadius)
                .strokeBorder(border(model), lineWidth: 1)
        }
    }

    /// The verdict, as a rule down the side rather than a paragraph of coloured
    /// text: three lines of solid green read as an alert, not as an answer.
    private func verdict(_ correct: Bool, _ check: ConsumePrediction) -> some View {
        let tint = correct ? Palette.accent : Palette.amberInk
        return VStack(alignment: .leading, spacing: 5) {
            Kicker(correct ? "Correto" : "Tente outra", tint: tint)
            Text(verbatim: correct ? check.right : check.wrong)
                .font(.atlas(.sans, 13.5))
                .lineSpacing(3)
                .foregroundStyle(Palette.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 13)
        .overlay(alignment: .leading) { Capsule().fill(tint).frame(width: 3) }
    }

    /// Green marks the answer once it is found, amber every miss already spent.
    /// An option nobody has touched says nothing.
    private func mark(_ option: Int, _ check: ConsumePrediction, _ model: ConsumeViewModel) -> ChoiceMark {
        if model.missed.contains(option) { return .wrong }
        guard model.passed else { return .unmarked }
        return check.opts[safe: option]?.correct == true ? .right : .unmarked
    }

    /// The card's own edge answers too — it is the only part of the check still
    /// visible once the options have scrolled under the dock.
    private func border(_ model: ConsumeViewModel) -> Color {
        guard let grade = model.grade else { return Palette.accent.opacity(0.18) }
        return grade.correct ? Palette.accent.opacity(0.38) : Palette.amberInk.opacity(0.32)
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
