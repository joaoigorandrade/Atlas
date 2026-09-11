import SwiftUI
import UIKit

/// Design tokens, lifted from `Learning Platform Mobile.dc.html` and kept in
/// step with the web app's `lib/theme.ts`. Never hard-code a colour, a font or
/// a duration that has a token here — the two platforms drift the moment
/// someone eyeballs a hex.
///
/// Every colour is a *pair*: the light value is the one `lib/theme.ts` mirrors,
/// and the dark one beside it is iOS-only on purpose. The web has no dark mode,
/// so there is nothing over there to keep in step with yet; when it grows one,
/// these are the values to carry across. The dark half is a warm dark built out
/// of `ink`'s own hue rather than a neutral grey — the app is a publication at
/// night, not a different app.
public enum Palette {
    public static let paper = adaptive(0xF4F1EA, 0x15130F)
    public static let card = adaptive(0xFBF9F4, 0x1E1B16)
    public static let cardAlt = adaptive(0xF8F5EF, 0x232019)
    public static let chipBg = adaptive(0xF0ECE3, 0x2A261E)
    public static let ink = adaptive(0x2C2823, 0xF1EDE3)
    public static let inkSoft = adaptive(0x4A463F, 0xD6D1C5)
    public static let inkMuted = adaptive(0x6B665C, 0xB0AA9C)
    public static let inkFaint = adaptive(0x8A8478, 0x8E887B)
    public static let inkGhost = adaptive(0xA8A29A, 0x6F6A60)
    public static let accent = adaptive(0x2F6B4F, 0x6FB98E)
    public static let accentBg = adaptive(0xF2F6F2, 0x1B2A22)
    /// The label *on* an accent fill — the one token that does not simply
    /// lighten. The accent lifts to a pale green in the dark, so its label has
    /// to come back down to ink or the primary action goes unreadable.
    public static let accentInk = adaptive(0xF7F5EF, 0x12180F)
    public static let amberInk = adaptive(0xA06A30, 0xE0A860)
    public static let amberBg = adaptive(0xFAF3E6, 0x2A2116)
    public static let successBg = adaptive(0xEEF4EE, 0x1A241C)
    public static let dangerInk = adaptive(0x9A4034, 0xE08C7E)
    public static let dangerBg = adaptive(0xF9EDEA, 0x2C1A16)
    // The two phase accents that aren't already a state colour. Both are lifted
    // from the web's own phase modules — `CONNECT_COLOR` in
    // lib/curriculum/connect.ts and `CRUCIBLE_COLOR` in crucible.ts — which is
    // where they live there, so there is nothing in lib/theme.ts to mirror.
    public static let connectInk = adaptive(0x8C6B9E, 0xBFA0D0)
    public static let connectBg = adaptive(0xF4EEF7, 0x241E2A)
    public static let connectBorder = adaptive(0x8C6B9E, 0xBFA0D0, opacity: 0.35, darkOpacity: 0.45)
    public static let crucibleInk = adaptive(0xA23B34, 0xE08078)
    public static let crucibleBg = adaptive(0xA23B34, 0xE08078, opacity: 0.08, darkOpacity: 0.14)
    public static let crucibleBorder = adaptive(0xA23B34, 0xE08078, opacity: 0.28, darkOpacity: 0.38)
    /// A rule drawn in the text colour at a whisper. It follows `ink` across the
    /// appearance — black on paper, bone on the dark ground — and carries more
    /// alpha there, where a hairline has less contrast to spend.
    public static let hairline = adaptive(0x2C2823, 0xF1EDE3, opacity: 0.10, darkOpacity: 0.14)
    public static let hairlineStrong = adaptive(0x2C2823, 0xF1EDE3, opacity: 0.14, darkOpacity: 0.20)

    /// The colour a raised surface casts, at the weight the caller wants.
    /// Deliberately not `ink`: that token inverts with the appearance, and a
    /// shadow drawn in a light ink is a glow. Black in both schemes, heavier in
    /// the dark one, where there is less ground for a shadow to darken.
    public static func shade(_ opacity: Double) -> Color {
        adaptive(0x2C2823, 0x000000, opacity: opacity, darkOpacity: min(opacity * 3, 1))
    }
}

/// A token that answers to the device's appearance. Both halves live here
/// rather than in an asset catalogue: the pair stays beside the comment that
/// explains the token, and the package needs no resource bundle to hold it.
/// `darkOpacity` defaults to `opacity` — pass it only when a translucent token
/// needs more weight on the dark ground, which most of them do.
func adaptive(_ light: UInt32, _ dark: UInt32,
              opacity: Double = 1, darkOpacity: Double? = nil) -> Color {
    Color(UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(hex: dark, alpha: darkOpacity ?? opacity)
            : UIColor(hex: light, alpha: opacity)
    })
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

extension UIColor {
    convenience init(hex: UInt32, alpha: Double = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}
