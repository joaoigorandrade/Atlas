import SwiftUI

/// The design file's CSS classes, as the app's only styling vocabulary.
/// A screen composes these; it does not re-declare a padding, a radius or a
/// border that one of them already carries.

/// The press feedback every button in the app wears. One style rather than a
/// `scaleEffect` per call site: a tap that doesn't answer reads as a dropped
/// tap, and the design has no second opinion about how hard it answers.
public struct Pressable: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.timingCurve(0.4, 0, 0.2, 1, duration: Motion.instant), value: configuration.isPressed)
    }
}

public extension View {
    /// Shorthand, so a screen never spells the style out.
    func pressable() -> some View { buttonStyle(Pressable()) }

    /// Tapping the page outside a control hands the keyboard back. A plain tap
    /// gesture, so fields and buttons still win their own taps.
    func dismissesKeyboardOnTap() -> some View {
        onTapGesture {
            #if canImport(UIKit)
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            #endif
        }
    }
}

/// `.kick` — the monospace uppercase kicker above almost every block.
public struct Kicker: View {
    private let text: Text
    private let tint: Color
    /// 10pt everywhere except the auth screens, which the design sets at 11.
    private let size: CGFloat
    public init(_ key: LocalizedStringKey, tint: Color = Palette.inkFaint, size: CGFloat = 10) {
        text = Text(key); self.tint = tint; self.size = size
    }
    /// A kicker over generated material — a section's own heading, a problem's
    /// tag, a formatted date. Never copy: nothing here goes in the catalogue.
    public init(verbatim: String, tint: Color = Palette.inkFaint, size: CGFloat = 10) {
        text = Text(verbatim: verbatim); self.tint = tint; self.size = size
    }
    public var body: some View {
        text
            .font(.atlas(.mono, size))
            .tracking(size * 0.16)
            .foregroundStyle(tint)
            .textCase(.uppercase)
    }
}

/// `.bar` — the 52pt top bar. Leading/trailing slots, nothing else.
public struct TopBar<Leading: View, Trailing: View>: View {
    private let leading: Leading
    private let trailing: Trailing
    public init(@ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.leading = leading(); self.trailing = trailing()
    }
    public var body: some View {
        HStack(spacing: 12) {
            leading
            Spacer(minLength: 0)
            trailing
        }
        .padding(.horizontal, 16)
        // A floor, not a height: `Font.custom(_:size:)` scales with Dynamic
        // Type, so at the accessibility sizes a two-line slot (the phase
        // kicker over the concept) grew past a fixed 52 and was sheared off
        // against the divider. Every screen with a bar had it.
        .frame(minHeight: Metrics.bar)
        .background(Palette.card.opacity(0.92))
        .overlay(alignment: .bottom) { Divider().overlay(Palette.hairline) }
    }
}

/// `.card` — paper card, hairline border, 16pt radius.
public struct Card<Content: View>: View {
    private let border: Color
    private let content: Content
    public init(border: Color = Palette.hairlineStrong, @ViewBuilder content: () -> Content) {
        self.border = border; self.content = content()
    }
    public var body: some View {
        content
            .background(Palette.card)
            .clipShape(.rect(cornerRadius: Metrics.cardRadius))
            .overlay {
                RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(border, lineWidth: 1)
            }
    }
}

/// `.cta` — the one primary action on a screen. Tint carries the phase colour.
public struct CTAButton: View {
    private let title: LocalizedStringKey
    private let tint: Color
    /// The taller 58pt variant the design uses when the CTA is the whole screen
    /// (auth), rather than one row of a dock.
    private let hero: Bool
    private let action: () -> Void
    /// A dead control that looks live is a dropped tap the learner blames on
    /// the app. The dimming lives here rather than at the call site: `.disabled`
    /// is the one thing that decides it, so a CTA can never be turned off
    /// without looking off — `GhostButton` beside it in the same dock used to
    /// dim while this one stayed fully lit.
    @Environment(\.isEnabled) private var enabled
    public init(_ title: LocalizedStringKey, tint: Color = Palette.accent, hero: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.tint = tint; self.hero = hero; self.action = action
    }
    public var body: some View {
        // Fill and shadow live inside the label so the whole pill answers a
        // press, not just the words on it.
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, hero ? 16 : 15, weight: .semibold))
                .foregroundStyle(Palette.accentInk)
                .frame(maxWidth: .infinity, minHeight: hero ? Metrics.ctaHero : Metrics.cta)
                .background(tint, in: .rect(cornerRadius: hero ? 13 : 12))
                .shadow(color: tint.opacity(0.26), radius: 11, y: 8)
        }
        .pressable()
        .opacity(enabled ? 1 : 0.5)
        // The phase colour is the CTA's whole job — it must not cut between
        // two phases, and neither must the disabled dimming above it.
        .animation(Motion.standard, value: tint)
        .animation(Motion.standard, value: enabled)
    }
}

/// `.ghost` — the secondary, always-optional action.
public struct GhostButton: View {
    private let title: LocalizedStringKey
    private let action: () -> Void
    public init(_ title: LocalizedStringKey, action: @escaping () -> Void) {
        self.title = title; self.action = action
    }
    @Environment(\.isEnabled) private var enabled
    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.inkMuted)
                // A dock's two buttons sit side by side, and at the
                // accessibility sizes the label is what decides how wide each
                // needs to be. Never a fixed width at the call site: that is
                // what sheared "Ensinar de novo" into "Teach…".
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
        }
        .pressable()
        .opacity(enabled ? 1 : 0.4)
        .animation(Motion.standard, value: enabled)
    }
}

/// `.dock` — actions pinned above the home indicator. A screen has at most one.
public struct Dock<Content: View>: View {
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View {
        VStack(spacing: 10) { content }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 12)
            .padding(.bottom, 10)
            .background(Palette.card.opacity(0.96))
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
    }
}

/// `.chip` — a pill carrying a dot and a label (state, streak, deadline).
public struct Chip: View {
    private let text: Text
    private let dot: Color?
    private let tint: Color
    private let background: Color
    public init(_ key: LocalizedStringKey, dot: Color? = nil, tint: Color = Palette.inkSoft, background: Color = Palette.chipBg) {
        text = Text(key); self.dot = dot; self.tint = tint; self.background = background
    }
    /// A chip over something the learner or the map wrote — a count, a
    /// prerequisite's name, an interest. Never copy.
    public init(verbatim: String, dot: Color? = nil, tint: Color = Palette.inkSoft, background: Color = Palette.chipBg) {
        text = Text(verbatim: verbatim); self.dot = dot; self.tint = tint; self.background = background
    }
    public var body: some View {
        HStack(spacing: 6) {
            if let dot { Circle().fill(dot).frame(width: 6, height: 6) }
            text.font(.atlas(.sans, 12.5))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(background, in: .capsule)
        .overlay { Capsule().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}

/// How one answer was graded, once a question has been answered. `unmarked` is
/// every option before a verdict lands — and every option nobody chose after
/// it, because an option nobody picked says nothing.
public enum ChoiceMark: Equatable {
    case unmarked, right, wrong

    /// Green for the answer, amber for a miss that was picked. Nil is the
    /// hairline every ungraded option keeps.
    var tint: Color? {
        switch self {
        case .unmarked: return nil
        case .right: return Palette.accent
        case .wrong: return Palette.amberInk
        }
    }

    var fill: Color {
        switch self {
        case .unmarked: return Palette.card
        case .right: return Palette.successBg
        case .wrong: return Palette.amberBg
        }
    }

    var symbol: String? {
        switch self {
        case .unmarked: return nil
        case .right: return "checkmark"
        case .wrong: return "xmark"
        }
    }
}

/// One option of a closed question. Every pick-an-answer surface wears this —
/// the placement's questions and Consume's section check are the same control,
/// and a second hand-written pill is how the two drift a padding apart.
///
/// The disc carries three things at once: whether this is the option the
/// learner picked (it fills), how it was graded (it tints, and takes a glyph),
/// and whether the question still takes a tap (what it marked never dims).
public struct ChoiceRow: View {
    private let label: String
    private let mark: ChoiceMark
    /// Picked by the learner, as opposed to merely revealed as the answer.
    private let chosen: Bool
    /// Still takes a tap.
    private let enabled: Bool
    private let action: () -> Void

    public init(_ label: String, mark: ChoiceMark = .unmarked, chosen: Bool = false,
                enabled: Bool = true, action: @escaping () -> Void) {
        self.label = label
        self.mark = mark
        self.chosen = chosen
        self.enabled = enabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                disc
                Text(verbatim: label)
                    .font(.atlas(.sans, 15))
                    .lineSpacing(3)
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            // A wrapped option is the common case, not the exception: the
            // padding has to hold on three lines, which is what a bare
            // `minHeight` was never going to do.
            .padding(.horizontal, 15)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, minHeight: Metrics.tap, alignment: .leading)
            .background(mark.fill, in: .rect(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(mark.tint ?? Palette.hairlineStrong,
                                  lineWidth: mark == .unmarked ? 1 : 1.5)
            }
        }
        .pressable()
        .disabled(!enabled)
        // Settled, and this one carried no verdict: it steps back rather than
        // vanishing — the learner still reads what they didn't pick.
        .opacity(!enabled && mark == .unmarked ? 0.45 : 1)
        .animation(Motion.standard, value: mark)
        .animation(Motion.standard, value: enabled)
        .accessibilityAddTraits(chosen ? [.isSelected] : [])
    }

    private var disc: some View {
        ZStack {
            Circle()
                .strokeBorder(mark.tint ?? Palette.hairlineStrong, lineWidth: 1.5)
                .background(Circle().fill(chosen ? (mark.tint ?? Color.clear) : Color.clear))
            if let symbol = mark.symbol {
                Image(systemName: symbol)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(chosen ? Palette.accentInk : (mark.tint ?? Palette.inkFaint))
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: 18, height: 18)
        // The disc sits on the first line of a label that wraps, not halfway
        // down the block.
        .padding(.top, 2)
    }
}

/// The segmented progress rail — diagnostic questions, Consume sections,
/// Feynman beats, a Retain deck. `fills` is one colour per segment, nil for spent.
public struct SegmentBar: View {
    private let fills: [Color?]
    private let height: CGFloat
    /// What the rail says out loud. A row of capsules is the only progress
    /// indicator on the screen and announces nothing without it.
    private let spoken: Text
    public init(_ fills: [Color?], height: CGFloat = 4, value: Text = Text(verbatim: "")) {
        self.fills = fills; self.height = height; self.spoken = value
    }
    public var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(fills.enumerated()), id: \.offset) { _, fill in
                Capsule().fill(fill ?? Palette.hairlineStrong).frame(height: height)
            }
        }
        // The rail is the only thing on screen that says "you moved" — a
        // segment lighting is worth the quarter second.
        .animation(Motion.standard, value: fills)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Progresso"))
        .accessibilityValue(spoken)
    }
}

/// The session top bar: back to the map, the phase kicker over the node's
/// name, and whatever that phase puts on the right (a speaker, a help dial, a
/// beat count). Every phase screen wears it — that is what makes them one
/// surface rather than five.
public struct PhaseBar<Trailing: View>: View {
    private let phase: Phase
    private let title: String
    private let trailing: Trailing
    private let back: () -> Void

    public init(_ phase: Phase, title: String, back: @escaping () -> Void,
                @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.phase = phase; self.title = title; self.back = back; self.trailing = trailing()
    }

    public var body: some View {
        TopBar {
            HStack(spacing: 10) {
                BackButton(action: back)
                VStack(alignment: .leading, spacing: 2) {
                    Kicker(phase.kicker, tint: phase.tint, size: 9.5)
                    Text(title)
                        .font(.atlas(.serif, 16))
                        .foregroundStyle(Palette.ink)
                        // Two lines, not one: `TopBar`'s height is a floor, and
                        // a concept whose name is four words truncated to
                        // "Regra da c…" at the accessibility sizes.
                        .lineLimit(2)
                }
            }
            .padding(.leading, -12)
        } trailing: {
            trailing
        }
    }
}

/// A free-text answer area with its mic. The design puts one on every phase
/// that asks the learner to write, and voice is never a second choice — it
/// follows the interface language.
public struct AnswerEditor: View {
    @Binding private var text: String
    private let placeholder: String
    /// The box grows with the type scale. A fixed 150pt held about three lines
    /// at AX3 — on the one phase whose premise is a long free explanation.
    @ScaledMetric private var minHeight: CGFloat
    /// Take every point the page has left, rather than a floor with empty paper
    /// under it. The screen that sets this must not put the editor inside a
    /// `ScrollView`: two nested scrolls is a drag that does different things a
    /// few points apart.
    private let fills: Bool
    private let tint: Color
    /// The recogniser belongs to the phase, not to the box: a `Dictation` built
    /// here died with the card it was drawn in (Feynman rebuilds one per beat)
    /// and took the learner's spoken answer with it.
    private let dictation: Dictation
    /// Voice is a setting, and screen 13 owns it — one read here covers every
    /// phase that asks the learner to write.
    @Environment(AtlasStore.self) private var store

    public init(text: Binding<String>, placeholder: String, dictation: Dictation,
                minHeight: CGFloat = 150, fills: Bool = false, tint: Color = Palette.accent) {
        _text = text; self.placeholder = placeholder; self.dictation = dictation
        _minHeight = ScaledMetric(wrappedValue: minHeight)
        self.fills = fills; self.tint = tint
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(verbatim: placeholder)
                        .font(.atlas(.serif, 15.5))
                        .foregroundStyle(Palette.inkGhost)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .font(.atlas(.serif, 15.5))
                    .foregroundStyle(Palette.ink)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: minHeight, maxHeight: fills ? .infinity : nil)
            }
            .frame(maxHeight: fills ? .infinity : nil)
            if store.dictationOn {
                HStack(alignment: .center, spacing: 8) {
                    if let trouble = dictation.trouble {
                        Text(verbatim: trouble.sentence)
                            .font(.atlas(.sans, 12.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    MicButton(dictation: dictation, tint: tint) { text += text.isEmpty ? $0 : " \($0)" }
                }
                .padding(.top, 6)
                .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(Motion.snap, value: store.dictationOn)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
        // Whatever was being said when the learner walked off the screen is
        // still delivered — the transcript only exists inside the recogniser
        // until something asks for it.
        .onDisappear { dictation.flush() }
    }
}

/// The mic itself — 44pt, labelled, and coloured by the phase while it listens.
public struct MicButton: View {
    private let dictation: Dictation
    private let tint: Color
    private let onText: (String) -> Void

    public init(dictation: Dictation, tint: Color = Palette.accent, onText: @escaping (String) -> Void) {
        self.dictation = dictation; self.tint = tint; self.onText = onText
    }

    public var body: some View {
        Button {
            dictation.toggle(onText: onText)
        } label: {
            Image(systemName: dictation.listening ? "mic.fill" : "mic")
                .font(.system(size: 17))
                .foregroundStyle(dictation.listening ? tint : Palette.inkMuted)
                // The mic is the one control whose *state* the learner has to
                // read from across the room: it swaps glyph and then breathes
                // for as long as it is listening.
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.variableColor.iterative, isActive: dictation.listening)
                .frame(width: Metrics.tap, height: Metrics.tap)
        }
        .pressable()
        .animation(Motion.snap, value: dictation.listening)
        .sensoryFeedback(.selection, trigger: dictation.listening)
        .accessibilityLabel(dictation.listening ? "Parar de ditar" : "Ditar resposta")
        // The mic's whole signal is its state, and a glyph that breathes says
        // nothing to VoiceOver.
        .accessibilityValue(dictation.listening ? Text("Ouvindo") : Text("Parado"))
        .accessibilityAddTraits(.startsMediaSession)
    }
}

/// The app's own indeterminate wait. `ProgressView`'s spinner is the one
/// control on these screens drawn by UIKit rather than by the design, and it
/// reads as a system alert in the middle of paper — three ink dots lit in turn
/// say the same thing in the app's own voice. The effect is the same one the
/// mic wears while it listens, which is the only other "still working" beat in
/// the app.
public struct AtlasPulse: View {
    private let tint: Color
    private let size: CGFloat
    public init(tint: Color = Palette.inkFaint, size: CGFloat = 20) {
        self.tint = tint; self.size = size
    }
    public var body: some View {
        Image(systemName: "ellipsis")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tint)
            .symbolEffect(.variableColor.iterative.dimInactiveLayers, isActive: true)
            .accessibilityLabel("Carregando")
    }
}

/// Prose that hasn't landed yet, in the shape it will land in — the paragraph
/// rhythm of a reading, so the screen doesn't jump from an empty box to a wall
/// of text. The lines settle in one after another, and a slanted sheen crosses
/// the block about once a second; under Reduce Motion the bars simply sit
/// there, which is still the right shape.
public struct SkeletonLines: View {
    /// Each paragraph, each line's share of the width. The default is one
    /// settled paragraph and most of a second — the rhythm of a reading, not a
    /// single stub floating at the top of an empty screen.
    private let paragraphs: [[Double]]
    @State private var sweeping = false
    @State private var settled = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ paragraphs: [[Double]] = [[1, 0.96, 0.82, 0.99, 0.55], [1, 0.9, 0.97, 0.64]]) {
        self.paragraphs = paragraphs
    }

    public var body: some View {
        bars
            .overlay { if !reduceMotion { sweep } }
            // The sheen is painted over the whole block and then cut to the
            // bars, so it lights the text lines and never the gaps.
            .mask { bars }
            .task {
                sweeping = true
                withAnimation(Motion.enter) { settled = true }
            }
            .accessibilityHidden(true)
    }

    /// Flattened once so a line knows both its gap above — 13 inside a
    /// paragraph, 24 between two — and its place in the settling order.
    private var lines: [(width: Double, gap: CGFloat)] {
        paragraphs.enumerated().flatMap { paragraph, widths in
            widths.enumerated().map { line, width in
                (width, line > 0 ? 13 : (paragraph > 0 ? 24 : 0))
            }
        }
    }

    private var bars: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                GeometryReader { geo in
                    Capsule().fill(Palette.hairline).frame(width: geo.size.width * line.width)
                }
                .frame(height: 11)
                .padding(.top, line.gap)
                // Each line lands a beat after the one above it, so the shape
                // writes itself down the page instead of appearing whole.
                .opacity(settled || reduceMotion ? 1 : 0)
                .animation(
                    reduceMotion ? nil : Motion.enter.delay(Double(index) * 0.05),
                    value: settled
                )
            }
        }
    }

    private var sweep: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [.clear, Palette.paper.opacity(0.85), .clear],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(width: geo.size.width * 0.5)
            .offset(x: sweeping ? geo.size.width : -geo.size.width * 0.5)
            .animation(.easeInOut(duration: 1.35).repeatForever(autoreverses: false), value: sweeping)
        }
    }
}

/// The app's own indeterminate bar — a hairline rule with a short accent
/// segment travelling it. `ProgressView(.linear)` is UIKit's, and it reads as a
/// system alert in the middle of paper the same way its spinner does.
public struct AtlasProgressBar: View {
    @State private var travelling = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    public init() {}
    public var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Palette.hairline)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(Palette.accent)
                        // Under Reduce Motion the segment holds still rather
                        // than pacing the width for as long as the wait lasts.
                        .frame(width: geo.size.width * (reduceMotion ? 1 : 0.34))
                        .opacity(reduceMotion ? 0.35 : 1)
                        .offset(x: travelling && !reduceMotion ? geo.size.width * 0.66 : 0)
                        .animation(
                            reduceMotion
                                ? nil
                                : .easeInOut(duration: 1.3).repeatForever(autoreverses: true),
                            value: travelling
                        )
                }
                .clipShape(Capsule())
        }
        .frame(height: 3)
        .task { travelling = true }
        .accessibilityHidden(true)
    }
}

public extension AnyTransition {
    /// How generated material replaces the wait that held its place: it rises
    /// the last few points in rather than cutting over the skeleton.
    static var arrival: AnyTransition { .opacity.combined(with: .offset(y: 10)) }
}

/// A generation in flight, or the honest sentence about why it isn't coming.
///
/// A wait is drawn as the thing being waited for: the paragraph shape of the
/// prose, with the sentence about what Atlas is writing under it. A failure is
/// only the sentence — nothing is coming, so nothing is shaped.
struct Waiting: View {
    private let text: Text
    /// A failure is not a wait: the shape and the dots come off when the
    /// sentence on screen is the reason nothing is coming.
    private let spinning: Bool
    /// A generation that lands in a few hundred milliseconds should look
    /// instant, not like a skeleton that flashed. Held back one beat.
    @State private var shown = false
    /// The sentence answers the shape a beat later — see `body`.
    @State private var narrating = false
    init(_ key: LocalizedStringKey, spinning: Bool = true) { text = Text(key); self.spinning = spinning }
    /// The sentence a view model already resolved — an `ErrorCopy` line, or a
    /// wait it picked between several. Localised there, not here.
    init(verbatim: String, spinning: Bool = true) { text = Text(verbatim: verbatim); self.spinning = spinning }
    var body: some View {
        VStack(alignment: spinning ? .leading : .center, spacing: 24) {
            if spinning {
                SkeletonLines().padding(.top, 30)
                // The sentence sits under the shape, on the same left edge as
                // the prose it stands in for — a caption centred against
                // left-aligned bars is the thing that reads as unfinished.
                HStack(spacing: 9) {
                    AtlasPulse(size: 17)
                    sentence(.leading)
                }
                .opacity(narrating ? 1 : 0)
            } else {
                Spacer(minLength: 0)
                sentence(.center)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: spinning ? .top : .center)
        .padding(.horizontal, Metrics.gutter)
        .opacity(shown ? 1 : 0)
        .task {
            try? await Task.sleep(for: .milliseconds(spinning ? 180 : 0))
            withAnimation(Motion.standard) { shown = true }
            guard spinning else { return }
            // The shape lands first and the sentence answers it, rather than
            // both arriving in the same frame.
            try? await Task.sleep(for: .milliseconds(420))
            withAnimation(Motion.enter) { narrating = true }
        }
        .transition(.opacity)
    }

    private func sentence(_ alignment: TextAlignment) -> some View {
        text.font(.atlas(.sans, 13.5))
            .foregroundStyle(Palette.inkMuted)
            .multilineTextAlignment(alignment)
    }
}

/// The chevron every pushed screen wears — settings, calibration, and the phase
/// bar. Icon-only, so it carries its own label.
public struct BackButton: View {
    private let action: () -> Void
    public init(action: @escaping () -> Void) { self.action = action }
    public var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Palette.inkMuted)
                .frame(width: Metrics.tap, height: Metrics.tap)
        }
        .pressable()
        .accessibilityLabel("Voltar")
    }
}

/// The learner's initials on the dark disc — the design's one avatar, on the
/// home bar and at the top of the profile.
public struct Avatar: View {
    private let email: String?
    private let size: CGFloat
    public init(_ email: String?, size: CGFloat = 34) { self.email = email; self.size = size }

    public var body: some View {
        Text(initials)
            .font(.atlas(.mono, size * 0.38, weight: .semibold))
            .foregroundStyle(Palette.accentInk)
            .frame(width: size, height: size)
            .background(Palette.ink, in: .circle)
    }

    /// Two letters from the address — the account has no display name to ask.
    private var initials: String {
        let name = email?.split(separator: "@").first.map(String.init) ?? ""
        let parts = name.split(whereSeparator: { ".-_+".contains($0) }).prefix(2)
        let letters = parts.compactMap(\.first).map { String($0) }.joined()
        return letters.isEmpty ? "A" : letters.uppercased()
    }
}

/// A screen that has a slot in the shell but no implementation yet.
/// Delete each one as ios/PLAN.md's screen table is worked through.
struct Pending: View {
    let name: LocalizedStringKey
    init(_ name: LocalizedStringKey) { self.name = name }
    var body: some View {
        VStack(spacing: 8) {
            Kicker("Em construção")
            Text(name).font(.atlas(.serif, 26)).foregroundStyle(Palette.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.paper)
    }
}
