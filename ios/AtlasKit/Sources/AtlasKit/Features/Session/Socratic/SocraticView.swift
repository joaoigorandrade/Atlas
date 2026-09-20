import Navigation
import SwiftUI

/// "Socratic" (screen 15) — the contingent tutor. One probe at a time, the
/// learner's own words judged by the server.
struct SocraticView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: SocraticViewModel?
    /// The learner asked for the keyboard. Socratic opens on the mic — this is
    /// a conversation, and talking is how a learner reaches for words they have
    /// not rehearsed — and the choice sticks for the rest of the pass.
    @State private var typing = false
    /// The voice sheet. It opens itself whenever the turn comes back to the
    /// learner, and pulling it down is how they ask for the keyboard.
    @State private var speaking = false
    /// The sheet was closed by the screen — a sent answer, a hint, a tell —
    /// rather than dragged down. Without this the two are the same event, and
    /// every send would read as "I would rather type".
    @State private var closedByApp = false

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Escrevendo a primeira pergunta…") }
        }
        .background(Palette.paper)
        // The wait and the pass are one screen arriving, not two screens
        // swapping: the shape fades out under the prose that lands over it.
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? SocraticViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
    }

    private func content(_ model: SocraticViewModel) -> some View {
        VStack(spacing: 0) {
            // The clip stops on the way out. A read-aloud parked in its own
            // sleep otherwise keeps speaking over the map the learner just
            // went back to.
            PhaseBar(.socratic, title: model.node.label,
                     back: { model.leave(); navigator.pop() }) {
                HStack(spacing: 2) {
                    if store.readAloudOn { speaker(model) }
                    helpDial(model)
                }
            }

            // How long the pass is, and how each probe closed. The pass buys
            // and sells probes as it goes (`socratic.ts`'s `advance`), and this
            // is the only place a learner can see that happen — without it the
            // phase is a corridor of unknown length.
            if !model.log.isEmpty {
                SegmentBar(model.rail, height: 3, value: model.railValue)
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.top, 10)
                    .padding(.bottom, 8)
            }

            if model.log.isEmpty {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
            } else {
                transcript(model)
            }

            if model.failed {
                // A generation that came back with nothing leaves a sentence
                // ending in "tente de novo" over a screen with nothing to tap.
                Dock { CTAButton("Tentar de novo", tint: Phase.socratic.tint) { Task { await model.retry() } } }
            } else if model.done {
                doneDock(model)
            } else if !model.log.isEmpty && !model.awaiting && !speaking {
                // Voice unless the learner asked otherwise — or unless they
                // turned dictation off in settings (screen 13), which is the
                // same request made once for the whole app. While the sheet is
                // up it *is* the dock, so nothing is drawn under it.
                if voice {
                    voiceDock(model).transition(.opacity)
                } else {
                    answerDock(model).transition(.opacity)
                }
            }
        }
        // The turn came back to the learner, so the mic comes back with it.
        // `initial` matters: on a pass whose first probe is already cached the
        // turn is theirs before this is ever installed.
        .onChange(of: model.awaitingAnswer, initial: true) { _, mine in
            if mine && voice { speak(model) }
        }
        .onChange(of: speaking) { _, open in
            guard !open else { return }
            // Dragged down rather than closed by a send: the learner is asking
            // for the keyboard, which is the only other way to answer.
            if closedByApp { closedByApp = false } else { typing = true }
        }
        .sheet(isPresented: $speaking) {
            @Bindable var model = model
            VoiceSheet(
                dictation: model.dictation,
                tint: Phase.socratic.tint,
                text: $model.answer,
                placeholder: "Responda com suas palavras…",
                sendTitle: "Enviar resposta",
                busy: model.judging,
                escapes: [
                    .init("Estou travado") { close(); model.stuck() },
                    .init("Mostre-me esta") { close(); model.tell() },
                ],
                escapesEnabled: model.canEscape,
                listen: { model.listen() },
                send: { close(); Task { await model.send() } },
                keyboard: { close(); typing = true }
            )
                .presentationDetents([.height(VoiceSheet.height), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Palette.paper)
                // The conversation stays live behind it — the learner can scroll
                // back to what they are answering without giving up the mic.
                .presentationBackgroundInteraction(.enabled(upThrough: .height(VoiceSheet.height)))
        }
    }

    /// The screen closing the sheet — a sent answer, a hint, a tell. Distinct
    /// from the learner dragging it down, which is a request for the keyboard.
    private func close() {
        closedByApp = true
        speaking = false
    }

    /// Voice is the composer unless the learner turned dictation off for the
    /// whole app, or asked for the keyboard on this pass.
    private var voice: Bool { store.dictationOn && !typing }

    private func speak(_ model: SocraticViewModel) {
        model.stopReadAloud()
        speaking = true
    }

    /// Read the tutor's last turn out loud. Socratic is the one phase that is
    /// genuinely a conversation, and the mic is already the other half of it.
    private func speaker(_ model: SocraticViewModel) -> some View {
        Button { model.toggleReadAloud() } label: {
            Image(systemName: model.speaker.speaking ? "speaker.wave.2.fill" : "speaker.wave.2")
                .font(.system(size: 17))
                .foregroundStyle(model.speaker.speaking ? Phase.socratic.tint : Palette.inkMuted)
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.variableColor.iterative, isActive: model.speaker.speaking)
                .frame(width: Metrics.tap, height: Metrics.tap)
        }
        .pressable()
        .animation(Motion.snap, value: model.speaker.speaking)
        .accessibilityLabel("Ouvir a última fala")
        .disabled(!model.canSpeak)
        .opacity(model.speaker.loading ? 0.4 : 1)
    }

    /// Set the level, never cycle it — and say which one it is out loud, which
    /// three unlabelled capsules cannot.
    private func helpDial(_ model: SocraticViewModel) -> some View {
        Menu {
            Picker("Nível de apoio", selection: Binding(get: { model.help }, set: { model.setHelp($0) })) {
                ForEach(0...3, id: \.self) { level in
                    Text(verbatim: SocraticViewModel.helpLabel(level)).tag(level)
                }
            }
        } label: {
            HStack(spacing: 7) {
                Text("Apoio").font(.atlas(.mono, 11.5)).foregroundStyle(Palette.inkMuted)
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(1...3, id: \.self) { level in
                        Capsule()
                            .fill(model.help >= level ? Phase.socratic.tint : Palette.hairlineStrong)
                            .frame(width: 3, height: CGFloat(3 + level * 4))
                    }
                }
            }
            .padding(.horizontal, 11)
            .frame(minHeight: 36)
            .background(Palette.chipBg, in: .capsule)
        }
        .pressable()
        // The dial is the learner asking for more or less: the bars grow into
        // the new level rather than snapping to it.
        .animation(Motion.snap, value: model.help)
        .accessibilityLabel("Nível de apoio")
        .accessibilityValue(Text(verbatim: SocraticViewModel.helpLabel(model.help)))
    }

    private func transcript(_ model: SocraticViewModel) -> some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // What this phase is for, and the one promise it makes.
                    // It used to claim the learner had arrived from the
                    // reading, which a pass opened by skipping straight here
                    // had never done.
                    Kicker("Construa a ideia · eu flagro raciocínios errados", size: 10.5)
                    ForEach(model.log) { turn in
                        bubble(turn).id(turn.id)
                            // A turn arriving is the whole surface: it comes in
                            // from the side it was written on.
                            .transition(.move(edge: turn.learner ? .trailing : .leading)
                                .combined(with: .opacity))
                    }
                    if model.awaiting && !model.done {
                        working("Escrevendo a próxima pergunta…").transition(.opacity)
                    }
                    if model.judging {
                        working("Atlas está lendo sua resposta…").transition(.opacity)
                    }
                    if !model.message.isEmpty {
                        Text(verbatim: model.message).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk)
                    }
                    if !model.speaker.message.isEmpty {
                        Text(verbatim: model.speaker.message)
                            .font(.atlas(.sans, 13.5)).foregroundStyle(Palette.amberInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 20)
            }
            // A conversation grows downwards from the composer, not from the
            // top of the paper: one probe on a fresh pass used to float at the
            // top of the screen with the whole page empty under it.
            .defaultScrollAnchor(.bottom)
            // …and the composer is the sheet, so the turn being answered has to
            // sit above it rather than under it.
            .safeAreaInset(edge: .bottom) {
                Color.clear.frame(height: speaking ? VoiceSheet.height : 0)
            }
            .animation(Motion.standard, value: model.log.count)
            .animation(Motion.snap, value: model.judging)
            .animation(Motion.snap, value: model.awaiting)
            .onChange(of: model.log.count) { _, _ in
                withAnimation(Motion.standard) { scroll.scrollTo(model.log.last?.id, anchor: .bottom) }
            }
            .sensoryFeedback(.impact(weight: .light), trigger: model.log.count)
        }
    }

    private func working(_ text: LocalizedStringKey) -> some View {
        HStack(spacing: 8) {
            AtlasPulse(size: 15)
            Text(text).font(.atlas(.sans, 13)).foregroundStyle(Palette.inkFaint)
        }
    }

    @ViewBuilder
    private func bubble(_ turn: SocraticViewModel.Turn) -> some View {
        if turn.learner {
            Text(verbatim: turn.text)
                .font(.atlas(.sans, 14.5))
                .foregroundStyle(Palette.inkSoft)
                .padding(.horizontal, 15).padding(.vertical, 13)
                .background(Palette.card, in: .rect(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 4, topTrailingRadius: 14))
                .overlay {
                    UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 4, topTrailingRadius: 14)
                        .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            VStack(alignment: .leading, spacing: 7) {
                // A probe says which move it is making; a verdict says who is
                // speaking. Without the move, a hint and a fresh question are
                // the same serif under the same word.
                Kicker(verbatim: turn.move ?? "Atlas", tint: tone(turn.quality), size: 9.5)
                Text(verbatim: turn.text).font(.atlas(.serif, 17)).lineSpacing(4).foregroundStyle(Palette.ink)
                // The judge names the wrong idea behind a caught answer. It
                // used to be collected and never shown — so the learner read a
                // colour where there was a sentence.
                if let misconception = turn.misconception {
                    Text(verbatim: String(localized: "A ideia por trás: \(misconception)"))
                        .font(.atlas(.sans, 12.5))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 1)
                }
            }
            // The tone as a rail rather than only a tinted word: a catch reads
            // as a catch from across the bubble.
            .padding(.leading, 11)
            .overlay(alignment: .leading) {
                Capsule().fill(tone(turn.quality).opacity(0.55)).frame(width: 2.5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The tutor's colour says what kind of turn it is: a catch is amber, an
    /// affirmation green, direct teaching and ordinary probes the phase blue.
    private func tone(_ quality: String?) -> Color {
        switch quality {
        case "correct": Palette.accent
        case "near", "wrong": Palette.amberInk
        default: Phase.socratic.tint
        }
    }

    /// The end of the pass, which is not automatically an achievement: the line
    /// says what it earned, and the CTA goes where that verdict sends them.
    private func doneDock(_ model: SocraticViewModel) -> some View {
        Dock {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 9) {
                    Circle().fill(model.doneTint).frame(width: 8, height: 8)
                    Text(model.doneLine)
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(model.doneTint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CTAButton(
                    model.advanceLabel,
                    tint: model.outcome == .flagged ? Palette.amberInk : Phase.socratic.tint
                ) { model.advance() }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Answering

    /// What this probe has already established, and what is still open.
    ///
    /// The anti-stuck row. Without it a learner answering in two goes sees only
    /// "not quite" twice and reads it as failing twice; with it they watch a
    /// circle become a tick. Draws nothing for a pass generated before the bar
    /// existed — there is nothing to show, and an empty box reads as a bug.
    @ViewBuilder
    private func ledger(_ model: SocraticViewModel) -> some View {
        if model.bar.count > 1 {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(model.bar.enumerated()), id: \.offset) { at, piece in
                    let has = model.covered.contains(at)
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Image(systemName: has ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 11))
                            .foregroundStyle(has ? NodeState.mastered.color : Palette.inkGhost)
                        // The piece stays hidden until it is banked: printing the
                        // whole bar up front hands over the outline of the answer
                        // before the question is asked.
                        Text(has ? piece : "—")
                            .font(.atlas(.sans, 12.5))
                            .foregroundStyle(has ? Palette.ink : Palette.inkFaint)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    /// Voice mode's dock. The composer itself is the sheet — this is the way
    /// back into it when the sheet is not up, and the way out to the keyboard.
    private func voiceDock(_ model: SocraticViewModel) -> some View {
        Dock {
            ledger(model)
            escapes(model)
            HStack(spacing: 10) {
                CTAButton("Falar", tint: Phase.socratic.tint) { speak(model) }
                    .disabled(model.judging)
                modeButton(model, toVoice: false)
            }
        }
    }

    /// The typed composer: one row — the mic, the field, the send. The mic is
    /// the way back to voice, so the dock never needs a third row to offer it.
    private func answerDock(_ model: SocraticViewModel) -> some View {
        @Bindable var model = model
        return Dock {
            ledger(model)
            escapes(model)
            HStack(alignment: .bottom, spacing: 6) {
                // Voice is a setting (screen 13): a learner who turned dictation
                // off is not offered it back one screen at a time.
                if store.dictationOn { modeButton(model, toVoice: true) }
                TextField("Responda com suas palavras…", text: $model.answer, axis: .vertical)
                    .font(.atlas(.serif, 15))
                    .lineLimit(1...5)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Palette.card, in: .capsule)
                    .overlay { Capsule().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                Button {
                    Task { await model.send() }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(model.canSend ? Palette.accentInk : Palette.inkGhost)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                        .background(model.canSend ? Phase.socratic.tint : Palette.chipBg, in: .circle)
                }
                .pressable()
                .animation(Motion.snap, value: model.canSend)
                .accessibilityLabel("Enviar resposta")
                .disabled(!model.canSend)
            }
        }
    }

    /// The only way off a probe used to be typing something the judge graded
    /// `correct` or `lost`. Both of these spend material the generation already
    /// wrote: `hint` and `tell`.
    private func escapes(_ model: SocraticViewModel) -> some View {
        HStack(spacing: 8) {
            escape("Estou travado") { model.stuck() }
            escape("Mostre-me esta") { model.tell() }
            Spacer(minLength: 0)
        }
        .disabled(!model.canEscape)
        .opacity(model.canEscape ? 1 : 0.4)
        .animation(Motion.standard, value: model.canEscape)
    }

    /// An escape is an aside, not an offer: it reads at the weight of the
    /// support dial above it, and leaves the composer the only lit thing here.
    private func escape(_ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)
                .lineLimit(2)
                .padding(.horizontal, 13)
                .frame(minHeight: 34)
                .background(Palette.chipBg, in: .capsule)
                // The pill is the drawing; the tap target is the design's
                // minimum around it.
                .frame(minHeight: Metrics.tap)
                .contentShape(.rect)
        }
        .pressable()
    }

    /// Swap composers. Whatever was being said goes into the field on the way
    /// across, so the half-spoken answer survives the switch — and asking for
    /// the mic back opens the sheet rather than a button that opens the sheet.
    private func modeButton(_ model: SocraticViewModel, toVoice: Bool) -> some View {
        Button {
            model.dictation.flush()
            withAnimation(Motion.snap) { typing = !toVoice }
            if toVoice { speak(model) }
        } label: {
            Image(systemName: toVoice ? "mic" : "keyboard")
                .font(.system(size: 17))
                .foregroundStyle(Palette.inkMuted)
                .frame(width: Metrics.tap, height: Metrics.tap)
                .contentShape(.rect)
        }
        .pressable()
        .accessibilityLabel(toVoice ? "Falar" : "Prefiro escrever")
    }
}
