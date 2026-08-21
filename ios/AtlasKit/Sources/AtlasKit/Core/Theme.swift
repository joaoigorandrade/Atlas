import SwiftUI

/// Design tokens, lifted from `Learning Platform Mobile.dc.html` and kept in
/// step with the web app's `lib/theme.ts`. Never hard-code a colour, a font or
/// a duration that has a token here — the two platforms drift the moment
/// someone eyeballs a hex.
public enum Palette {
    public static let paper = Color(hex: 0xF4F1EA)
    public static let card = Color(hex: 0xFBF9F4)
    public static let cardAlt = Color(hex: 0xF8F5EF)
    public static let chipBg = Color(hex: 0xF0ECE3)
    public static let ink = Color(hex: 0x2C2823)
    public static let inkSoft = Color(hex: 0x4A463F)
    public static let inkMuted = Color(hex: 0x6B665C)
    public static let inkFaint = Color(hex: 0x8A8478)
    public static let inkGhost = Color(hex: 0xA8A29A)
    public static let accent = Color(hex: 0x2F6B4F)
    public static let accentBg = Color(hex: 0xF2F6F2)
    public static let accentInk = Color(hex: 0xF7F5EF)
    public static let amberInk = Color(hex: 0xA06A30)
    public static let amberBg = Color(hex: 0xFAF3E6)
    public static let successBg = Color(hex: 0xEEF4EE)
    public static let dangerInk = Color(hex: 0x9A4034)
    public static let dangerBg = Color(hex: 0xF9EDEA)
    // The two phase accents that aren't already a state colour. Both are lifted
    // from the web's own phase modules — `CONNECT_COLOR` in
    // lib/curriculum/connect.ts and `CRUCIBLE_COLOR` in crucible.ts — which is
    // where they live there, so there is nothing in lib/theme.ts to mirror.
    public static let connectInk = Color(hex: 0x8C6B9E)
    public static let connectBg = Color(hex: 0xF4EEF7)
    public static let connectBorder = Color(hex: 0x8C6B9E, opacity: 0.35)
    public static let crucibleInk = Color(hex: 0xA23B34)
    public static let crucibleBg = Color(hex: 0xA23B34, opacity: 0.08)
    public static let crucibleBorder = Color(hex: 0xA23B34, opacity: 0.28)
    public static let hairline = Color(hex: 0x2C2823, opacity: 0.10)
    public static let hairlineStrong = Color(hex: 0x2C2823, opacity: 0.14)
}

/// The three faces. `serif` is the family name of the variable
/// `App/Resources/Fonts/Newsreader.ttf` listed in `UIAppFonts` — CoreText
/// exposes its named cuts, so `.weight()` resolves to a real one. `sans` and
/// `mono` are still unbundled PostScript names: `Font.custom` falls back to the
/// system face when a file is missing, which is a silent visual regression —
/// check the render, not the build.
public enum Face: String {
    case serif = "Newsreader"
    case sans = "InstrumentSans-Regular"
    case mono = "SplineSansMono-Regular"
}

public extension Font {
    static func atlas(_ face: Face, _ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(face.rawValue, size: size).weight(weight)
    }
}

/// Motion tokens — same scale as `lib/theme.ts`, in seconds. Pick by intent.
public enum Motion {
    public static let instant = 0.09
    public static let fast = 0.15
    public static let base = 0.24
    public static let slow = 0.38
    /// Reward moments only — a concept going green, a streak lighting.
    public static let deliberate = 0.62

    /// The same curve as `standard`, at the `fast` step — a control answering
    /// a tap, not a screen changing.
    public static let snap = Animation.timingCurve(0.4, 0, 0.2, 1, duration: fast)
    public static let standard = Animation.timingCurve(0.4, 0, 0.2, 1, duration: base)
    public static let enter = Animation.timingCurve(0.2, 0.8, 0.3, 1, duration: slow)
    public static let spring = Animation.timingCurve(0.34, 1.56, 0.64, 1, duration: deliberate)
    /// A reward that fills rather than snaps — a mastery bar, a share of the
    /// map going up. Same duration as `spring`, without the overshoot.
    public static let reward = Animation.timingCurve(0.4, 0, 0.2, 1, duration: deliberate)
}

/// Layout constants the design fixes across every screen.
public enum Metrics {
    /// Every horizontal gutter in the mobile design.
    public static let gutter: CGFloat = 20
    /// Top bar height, above the safe area.
    public static let bar: CGFloat = 52
    /// The minimum tap target the design draws — smaller than this is a bug.
    public static let tap: CGFloat = 44
    /// Primary action height in a dock.
    public static let cta: CGFloat = 52
    /// The auth screens' full-width action, and any CTA that is the screen.
    public static let ctaHero: CGFloat = 58
    public static let cardRadius: CGFloat = 16
    public static let sheetRadius: CGFloat = 20
}

public extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
