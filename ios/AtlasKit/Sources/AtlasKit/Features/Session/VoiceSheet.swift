import SwiftUI

/// Answering out loud, as its own surface.
///
/// Socratic and Feynman are the two phases that ask for an explanation in the
/// learner's own words, and talking is how a learner reaches for one they have
/// never rehearsed. So voice is not a mic beside a field — it is this sheet:
/// the mic is already open when it arrives, the bars say it is hearing them,
/// and what it heard is a *draft* they can fix before the judge reads it.
///
/// Pulling it down is how they ask for the keyboard instead.
struct VoiceSheet: View {
    /// The detent, named here because whatever is behind has to inset by
    /// exactly this much — the thing being answered must not sit under the
    /// sheet it is being answered in.
    static let height: CGFloat = 356

    /// An escape hatch the phase offers while the sheet is up. Both of
    /// Socratic's spend material the generation already wrote; Feynman's asks
    /// for the freeze nudge. All of them land *behind* the sheet, so the
    /// action closes it.
    struct Escape: Identifiable {
        let id = UUID()
        let title: LocalizedStringKey
        let action: () -> Void
        init(_ title: LocalizedStringKey, action: @escaping () -> Void) {
            self.title = title; self.action = action
        }
    }

    let dictation: Dictation
    let tint: Color
    /// The draft. The recogniser writes into it through the phase's own
    /// `listen`, and the learner fixes it the moment the mic stops.
    @Binding var text: String
    let placeholder: LocalizedStringKey
    let sendTitle: LocalizedStringKey
    /// Something is already in flight — a judge reading, a rubric still being
    /// written. Words are not enough to send on their own.
    let busy: Bool
    let escapes: [Escape]
    let escapesEnabled: Bool
    /// Open the mic. Idempotent: the phase decides what else has to stop first
    /// (Socratic hands the audio session back from a read-aloud).
    let listen: () -> Void
    let send: () -> Void
    /// The keyboard, asked for out loud rather than by dragging.
    let keyboard: () -> Void

    init(dictation: Dictation, tint: Color, text: Binding<String>,
         placeholder: LocalizedStringKey, sendTitle: LocalizedStringKey, busy: Bool,
         escapes: [Escape] = [], escapesEnabled: Bool = true,
         listen: @escaping () -> Void, send: @escaping () -> Void, keyboard: @escaping () -> Void) {
        self.dictation = dictation; self.tint = tint; _text = text
        self.placeholder = placeholder; self.sendTitle = sendTitle; self.busy = busy
        self.escapes = escapes; self.escapesEnabled = escapesEnabled
        self.listen = listen; self.send = send; self.keyboard = keyboard
    }

    var body: some View {
        VStack(spacing: 14) {
            VoiceWave(level: dictation.level, active: dictation.listening, tint: tint)
            Text(status)
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkFaint)
                .multilineTextAlignment(.center)
            draft
            if let trouble = dictation.trouble {
                Text(verbatim: trouble.sentence)
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.amberInk)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !escapes.isEmpty {
                HStack(spacing: 8) {
                    ForEach(escapes) { hatch in
                        escapeChip(hatch.title) { dictation.flush(); hatch.action() }
                    }
                    Spacer(minLength: 0)
                }
                .disabled(!escapesEnabled)
                .opacity(escapesEnabled ? 1 : 0.4)
                .animation(Motion.standard, value: escapesEnabled)
            }
            // The mic, the send, and the way out to the keyboard: one row of
            // controls under the draft, rather than a stack of three.
            HStack(spacing: 10) {
                micButton
                CTAButton(sendTitle, tint: tint) {
                    // Whatever is still being said goes in before it is read,
                    // or the spoken half of the answer is lost.
                    dictation.flush()
                    send()
                }
                .disabled(!sendable)
                Button(action: keyboard) {
                    Image(systemName: "keyboard")
                        .font(.system(size: 17))
                        .foregroundStyle(Palette.inkMuted)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                        .contentShape(.rect)
                }
                .pressable()
                .accessibilityLabel("Prefiro escrever")
            }
        }
        .padding(.horizontal, Metrics.gutter)
        .padding(.top, 20)
        .padding(.bottom, 8)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Palette.paper)
        // The mic is what this sheet is. Opening it opens the mic, so the
        // learner talks instead of hunting for a second button — and closing it
        // hands the audio session back, whichever way it was closed.
        .onAppear { listen() }
        .onDisappear { dictation.flush() }
    }

    /// An escape is an aside, not an offer — the same weight it carries in the
    /// dock behind this sheet.
    private func escapeChip(_ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)
                .lineLimit(2)
                .padding(.horizontal, 13)
                .frame(minHeight: 34)
                .background(Palette.chipBg, in: .capsule)
                .frame(minHeight: Metrics.tap)
                .contentShape(.rect)
        }
        .pressable()
    }

    /// What was heard, as a draft. Read-only while the recogniser is still
    /// writing it — a field that rewrites itself under the cursor is worse than
    /// one that waits — and the learner's to fix the moment the mic stops.
    private var draft: some View {
        ZStack(alignment: .topLeading) {
            if said.isEmpty {
                Text(placeholder)
                    .font(.atlas(.serif, 16))
                    .foregroundStyle(Palette.inkGhost)
                    .padding(.horizontal, 19)
                    .padding(.vertical, 19)
                    .allowsHitTesting(false)
            }
            TextEditor(text: Binding(get: { said }, set: { text = $0 }))
                .font(.atlas(.serif, 16))
                .lineSpacing(3)
                .foregroundStyle(dictation.listening ? Palette.inkMuted : Palette.ink)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .disabled(dictation.listening)
        }
        .frame(minHeight: 96, maxHeight: .infinity)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    /// Stop, or start again and say more. The one control whose state has to
    /// read from across the room, so it swaps glyph and breathes while it runs.
    private var micButton: some View {
        let listening = dictation.listening
        return Button { listening ? dictation.flush() : listen() } label: {
            Image(systemName: listening ? "stop.fill" : "mic.fill")
                .font(.system(size: 21))
                .foregroundStyle(listening ? Palette.accentInk : Palette.inkSoft)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: Metrics.cta, height: Metrics.cta)
                .background(listening ? tint : Palette.chipBg, in: .circle)
                .overlay { Circle().strokeBorder(listening ? .clear : Palette.hairlineStrong, lineWidth: 1) }
        }
        .pressable()
        .animation(Motion.snap, value: listening)
        .sensoryFeedback(.selection, trigger: listening)
        .accessibilityLabel(listening ? "Parar de ditar" : "Ditar resposta")
        .accessibilityValue(listening ? Text("Ouvindo") : Text("Parado"))
        .accessibilityAddTraits(.startsMediaSession)
    }

    /// The answer as it stands: what is already in the draft plus whatever the
    /// recogniser is hearing right now, joined the way the phase will join
    /// them — so stopping the mic changes this text's colour and nothing else.
    private var said: String {
        let live = dictation.heard.trimmed
        guard !live.isEmpty else { return text }
        return text.isEmpty ? live : text + " " + live
    }

    /// Sendable the moment there are words, including words still being spoken:
    /// the flush above hands them over first, so a learner who has finished
    /// talking never has to stop the mic and then find the button.
    private var sendable: Bool { !busy && !said.trimmed.isEmpty }

    private var status: LocalizedStringKey {
        if dictation.listening { return "Ouvindo… toque para terminar" }
        if !text.trimmed.isEmpty { return "Toque para continuar falando" }
        return "Toque e responda com suas palavras"
    }
}

/// How many bars the strip holds. A file constant so the state below can be
/// sized by it.
private let voiceWaveBars = 32

/// The live input level as a scrolling strip — the one thing that tells a
/// learner the mic is actually hearing *them*. The heights come off the audio
/// tap rather than a timer: a canned animation says the same thing while lying,
/// and a mic that looks alive and is not is the failure this whole surface
/// exists to make impossible.
private struct VoiceWave: View {
    let level: Double
    let active: Bool
    let tint: Color
    @State private var bars = [Double](repeating: 0, count: voiceWaveBars)

    var body: some View {
        HStack(spacing: 3) {
            ForEach(bars.indices, id: \.self) { index in
                Capsule()
                    .fill(tint.opacity(active ? 0.3 + bars[index] * 0.7 : 0.16))
                    .frame(width: 3, height: 4 + bars[index] * 44)
            }
        }
        .frame(height: 52)
        .onChange(of: level) { _, landed in
            bars.removeFirst()
            bars.append(landed)
        }
        .onChange(of: active) { _, on in
            if !on { bars = [Double](repeating: 0, count: voiceWaveBars) }
        }
        // A row of bars announces nothing, and the line under it already says
        // whether the mic is open.
        .accessibilityHidden(true)
    }
}
