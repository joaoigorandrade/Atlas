import SwiftUI

/// The design file's CSS classes, as the app's only styling vocabulary.
/// A screen composes these; it does not re-declare a padding, a radius or a
/// border that one of them already carries.

/// `.kick` — the monospace uppercase kicker above almost every block.
public struct Kicker: View {
    private let text: String
    private let tint: Color
    /// 10pt everywhere except the auth screens, which the design sets at 11.
    private let size: CGFloat
    public init(_ text: String, tint: Color = Palette.inkFaint, size: CGFloat = 10) {
        self.text = text; self.tint = tint; self.size = size
    }
    public var body: some View {
        Text(text.uppercased())
            .font(.atlas(.mono, size))
            .tracking(size * 0.16)
            .foregroundStyle(tint)
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
        .frame(height: Metrics.bar)
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
    private let title: String
    private let tint: Color
    /// The taller 58pt variant the design uses when the CTA is the whole screen
    /// (auth), rather than one row of a dock.
    private let hero: Bool
    private let action: () -> Void
    public init(_ title: String, tint: Color = Palette.accent, hero: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.tint = tint; self.hero = hero; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, hero ? 16 : 15, weight: .semibold))
                .foregroundStyle(Palette.accentInk)
                .frame(maxWidth: .infinity, minHeight: hero ? Metrics.ctaHero : Metrics.cta)
        }
        .background(tint, in: .rect(cornerRadius: hero ? 13 : 12))
        .shadow(color: tint.opacity(0.26), radius: 11, y: 8)
    }
}

/// `.ghost` — the secondary, always-optional action.
public struct GhostButton: View {
    private let title: String
    private let action: () -> Void
    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.inkMuted)
                .frame(maxWidth: .infinity, minHeight: 48)
        }
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
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
    private let text: String
    private let dot: Color?
    private let tint: Color
    private let background: Color
    public init(_ text: String, dot: Color? = nil, tint: Color = Palette.inkSoft, background: Color = Palette.chipBg) {
        self.text = text; self.dot = dot; self.tint = tint; self.background = background
    }
    public var body: some View {
        HStack(spacing: 6) {
            if let dot { Circle().fill(dot).frame(width: 6, height: 6) }
            Text(text).font(.atlas(.sans, 12.5))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(background, in: .capsule)
        .overlay { Capsule().strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}

/// The segmented progress rail — diagnostic questions, Consume sections,
/// Feynman beats, a Retain deck. `fills` is one colour per segment, nil for spent.
public struct SegmentBar: View {
    private let fills: [Color?]
    private let height: CGFloat
    public init(_ fills: [Color?], height: CGFloat = 4) {
        self.fills = fills; self.height = height
    }
    public var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(fills.enumerated()), id: \.offset) { _, fill in
                Capsule().fill(fill ?? Palette.hairlineStrong).frame(height: height)
            }
        }
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
                Button(action: back) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Palette.inkMuted)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                }
                .accessibilityLabel("Voltar ao mapa")
                VStack(alignment: .leading, spacing: 2) {
                    Kicker(phase.kicker, tint: phase.tint, size: 9.5)
                    Text(title)
                        .font(.atlas(.serif, 16))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
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
    private let minHeight: CGFloat
    private let tint: Color
    @State private var dictation = Dictation()
    /// Voice is a setting, and screen 13 owns it — one read here covers every
    /// phase that asks the learner to write.
    @Environment(AtlasStore.self) private var store

    public init(text: Binding<String>, placeholder: String, minHeight: CGFloat = 150,
                tint: Color = Palette.accent) {
        _text = text; self.placeholder = placeholder; self.minHeight = minHeight; self.tint = tint
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
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
                    .frame(minHeight: minHeight)
            }
            if store.dictationOn {
                HStack {
                    Spacer(minLength: 0)
                    MicButton(dictation: dictation, tint: tint) { text += text.isEmpty ? $0 : " \($0)" }
                }
                .padding(.top, 6)
                .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
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
                .frame(width: Metrics.tap, height: Metrics.tap)
        }
        .accessibilityLabel(dictation.listening ? "Parar de ditar" : "Ditar resposta")
    }
}

/// A generation in flight, or the honest sentence about why it isn't coming.
struct Waiting: View {
    private let text: String
    /// A failure is not a wait: the spinner comes off when the sentence on
    /// screen is the reason nothing is coming.
    private let spinning: Bool
    init(_ text: String, spinning: Bool = true) { self.text = text; self.spinning = spinning }
    var body: some View {
        VStack(spacing: 10) {
            if spinning { ProgressView().tint(Palette.inkFaint) }
            Text(text).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkMuted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, Metrics.gutter)
    }
}
