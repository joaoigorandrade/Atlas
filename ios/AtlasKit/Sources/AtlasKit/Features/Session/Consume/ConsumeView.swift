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
                content(model).transition(.arrival)
            } else {
                Waiting("Escrevendo sua leitura…")
            }
        }
        .background(Palette.paper)
        // The wait and the pass are one screen arriving, not two screens
        // swapping: the shape fades out under the prose that lands over it.
        .animation(Motion.enter, value: model == nil)
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
            // The clip stops on the way out. A read-aloud parked in its own
            // sleep otherwise keeps speaking over the map the learner just
            // went back to.
            PhaseBar(.consume, title: model.node.label,
                     back: { model.stopReadAloud(); navigator.pop() }) {
                if store.readAloudOn { speaker(model) }
            }

            // The rail is also the way back: a section already read is one tap
            // away, instead of the back arrow (which leaves the pass) being the
            // only thing to press. Mirrors the web's jump-to-section rail.
            SegmentBar(model.rail, height: 3, value: model.railValue) { model.revisit($0) }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 10)
                // The scroll clips against the rail, so without a gap the prose
                // is sheared off flush under it as it passes — which reads as a
                // rendering fault rather than as scrolling.
                .padding(.bottom, 8)

            // A read-aloud that fails in silence reads as a dead button.
            if !model.speaker.message.isEmpty {
                Text(verbatim: model.speaker.message)
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.amberInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.top, 8)
            }

            if let chunk = model.chunk {
                ScrollView {
                    section(chunk, model)
                        .padding(.horizontal, Metrics.gutter)
                        .padding(.top, 22)
                        .padding(.bottom, 28)
                }
                .id(chunk.id)
                .transition(turn(back: model.goingBack))
                dock(model)
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                // A pass that failed with nothing at all still gets a retry —
                // the back arrow was the whole affordance here.
                if !model.message.isEmpty {
                    GhostButton("Tentar de novo") { Task { await model.load() } }
                        .disabled(model.writing)
                        .padding(.horizontal, Metrics.gutter)
                        .padding(.bottom, 28)
                }
            }
        }
        // A section is a page turn, and the check's verdict lands under it.
        .animation(Motion.standard, value: model.index)
        .animation(Motion.standard, value: model.picked)
        .animation(Motion.standard, value: model.missed)
        .animation(Motion.standard, value: model.reachedEnd)
        // A right answer and a miss are different events, and the wrist is the
        // one place the learner reads them without looking.
        .sensoryFeedback(trigger: model.grade) { _, new in
            guard let new else { return nil }
            return new.correct ? SensoryFeedback.success : SensoryFeedback.warning
        }
        .sheet(item: $model.lens) { request in
            ModelLensView(request: request, node: model.node)
                .presentationDetents([.medium, .large])
                .environment(store)
        }
    }

    /// A section turn, in the direction it was taken.
    private func turn(back: Bool) -> AnyTransition {
        .asymmetric(
            insertion: .move(edge: back ? .leading : .trailing).combined(with: .opacity),
            removal: .move(edge: back ? .trailing : .leading).combined(with: .opacity)
        )
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
        .disabled(model.chunk?.settled != true)
        .opacity(model.speaker.loading ? 0.4 : 1)
    }

    // MARK: - One section

    @ViewBuilder
    private func section(_ chunk: ConsumeChunk, _ model: ConsumeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(verbatim: chunk.kicker)
            ForEach(Array(chunk.body.enumerated()), id: \.offset) { index, paragraph in
                // The last paragraph of a section still being written ends
                // mid-sentence, so it says so: a caret glyph on the end of the
                // prose, which is where the next words are about to appear.
                //
                // ponytail: concatenated rather than blinking — a `Text` run
                // cannot carry its own animation, and an overlay that tracks
                // the end of reflowing markdown is a lot of machinery for a
                // mark that lives two seconds. Give it `Caret` if it reads dead.
                (Text(Markdown.rich(paragraph))
                    + (chunk.settled || index < chunk.body.count - 1
                        ? Text(verbatim: "")
                        : Text(verbatim: "\u{258C}").foregroundColor(Palette.accent)))
                    .font(.atlas(.serif, 17.5))
                    .lineSpacing(6)
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 14)
            }

            if let figure = chunk.figure {
                FigureView(figure, caption: chunk.diagram)
                    .padding(.top, 20)
            }

            if let example = chunk.example {
                Kicker("Exemplo").padding(.top, 22)
                Text(Markdown.rich(example.title)).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink).padding(.top, 8)
                ForEach(Array(example.steps.enumerated()), id: \.offset) { step, text in
                    HStack(alignment: .top, spacing: 10) {
                        Text(verbatim: "\(step + 1)").font(.atlas(.mono, 11)).foregroundStyle(Palette.inkFaint)
                        Text(Markdown.rich(text)).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                    }
                    .padding(.top, 8)
                }
            }

            // Nothing past the prose exists on a section still being written:
            // the takeaway is the sentence the model writes after it.
            if chunk.settled {
                Text(Markdown.rich(chunk.takeaway))
                    .font(.atlas(.serif, 16))
                    .foregroundStyle(Palette.ink)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.accentBg, in: .rect(cornerRadius: 10))
                    .padding(.top, 20)
                    // The check appears once the end of the section has been on
                    // screen — a gate answerable without scrolling past the prose
                    // no longer implies reading. Mirrors `SectionCheck`'s observer.
                    .onScrollVisibilityChange(threshold: 0.6) { shown in
                        if shown { model.reachEnd() }
                    }
            }

            // The lenses go with it — a model view is generated *from* the
            // section, so one opened over half of it walks half the material.
            if chunk.settled {
                Kicker("Ver de outro jeito").padding(.top, 24)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8, alignment: .leading)],
                          alignment: .leading, spacing: 8) {
                    ForEach(AltKey.allCases) { key in
                        // The lens the learner keeps reaching for is marked from
                        // the second time they pick it — SPEC §6's adaptive
                        // modality, as a border rather than a second content path.
                        let preferred = model.preferredLens == key
                        Button { model.open(key) } label: {
                            Text(key.label)
                                .font(.atlas(.mono, 12))
                                .foregroundStyle(preferred ? Palette.accent : Palette.inkMuted)
                                .frame(maxWidth: .infinity, minHeight: 40)
                                .background(preferred ? Palette.accentBg : Palette.card, in: .rect(cornerRadius: 8))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(preferred ? Palette.accent.opacity(0.4) : Palette.hairlineStrong,
                                                      lineWidth: 1)
                                }
                        }
                        .pressable()
                        .accessibilityHint(preferred ? Text("Sua preferência") : Text(verbatim: ""))
                    }
                }
                .padding(.top, 10)
            }

            if let check = chunk.check, model.reachedEnd {
                self.check(check, model)
                    .padding(.top, 24)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            if let cite = chunk.cite {
                Text("Leitura complementar · \(cite)")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkFaint)
                    .padding(.top, 22)
            }

            // What landed stays on screen when the stream dies — but the pass
            // is short, and the only way to ask for the rest used to be the
            // back arrow, which threw away everything already read.
            if model.incomplete { incomplete(model).padding(.top, 24) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The notice under the last section that landed, and the retry.
    private func incomplete(_ model: ConsumeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: model.message)
                .font(.atlas(.sans, 13.5))
                .lineSpacing(3)
                .foregroundStyle(Palette.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            GhostButton("Tentar de novo") { Task { await model.load() } }
                .disabled(model.writing)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Palette.card, in: .rect(cornerRadius: Metrics.cardRadius))
        .overlay {
            RoundedRectangle(cornerRadius: Metrics.cardRadius)
                .strokeBorder(Palette.amberInk.opacity(0.3), lineWidth: 1)
        }
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

            Text(Markdown.rich(check.q))
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
                    ChoiceRow(Markdown.plain(opt.label),
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
            Text(Markdown.rich(correct ? check.right : check.wrong))
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
            if model.chunk?.settled == false {
                // The section on screen *is* the one being written — the dock
                // said "next", which reads as a wait for something else while
                // the prose in front of the learner is still arriving.
                CTAButton("Escrevendo esta seção…", tint: Palette.inkGhost) {}
                    .disabled(true)
            } else if let next = model.next {
                CTAButton("Continuar · \(next.kicker)") { model.advance() }
                    .disabled(!model.passed)
            } else if model.writing {
                CTAButton("Escrevendo a próxima seção…", tint: Palette.inkGhost) {}
                    .disabled(true)
            } else {
                CTAButton("Seguir para o Socrático →") { model.finish() }
                    .disabled(!model.passed)
            }
        }
    }
}
