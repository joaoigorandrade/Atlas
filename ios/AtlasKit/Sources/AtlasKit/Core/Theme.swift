import SwiftUI
import UIKit

/// Design tokens, kept in step with the web app's `lib/theme.ts`: the app is
/// drawn as an old atlas — rag paper, iron-gall ink, engraved type and a
/// colourist's washes. Never hard-code a colour, a font or a duration that has
/// a token here — the two platforms drift the moment someone eyeballs a hex.
///
/// Every colour is a *pair*: the light value is the one `lib/theme.ts` mirrors,
/// and the dark one beside it is iOS-only on purpose. The web has no dark mode,
/// so there is nothing over there to keep in step with yet; when it grows one,
/// these are the values to carry across. The dark half is a warm dark built out
/// of `ink`'s own hue rather than a neutral grey — the atlas read by lamplight,
/// not a different app.
public enum Palette {
    // An old sheet: rag paper gone warm with age, and vellum for the plates.
    public static let paper = adaptive(0xEFE6D2, 0x15130F)
    public static let card = adaptive(0xF6EFDF, 0x1E1B16)
    public static let cardAlt = adaptive(0xF2E9D6, 0x232019)
    public static let chipBg = adaptive(0xE7DCC4, 0x2A261E)
    // Iron-gall ink, from the fresh stroke down to the ghost of one.
    public static let ink = adaptive(0x2B2118, 0xF1EDE3)
    public static let inkSoft = adaptive(0x46382A, 0xD6D1C5)
    public static let inkMuted = adaptive(0x6A5A47, 0xB0AA9C)
    public static let inkFaint = adaptive(0x8C7A63, 0x8E887B)
    public static let inkGhost = adaptive(0xAB9B84, 0x6F6A60)
    /// Verdigris: the one green an engraver's colourist had to hand.
    public static let accent = adaptive(0x3A6A55, 0x6FB98E)
    public static let accentBg = adaptive(0xE6EADC, 0x1B2A22)
    /// The label *on* an accent fill — the one token that does not simply
    /// lighten. The accent lifts to a pale green in the dark, so its label has
    /// to come back down to ink or the primary action goes unreadable.
    public static let accentInk = adaptive(0xF6EFDF, 0x12180F)
    /// Vermilion rubrication: the marks a scribe put in red.
    public static let rubric = adaptive(0xB03A22, 0xE08A6E)
    /// Gilt: the frontier, the ornaments.
    public static let gilt = adaptive(0xA8843A, 0xD4B26A)
    /// The engraved rule — the double borders on plates and mastheads.
    public static let rule = adaptive(0x2B2118, 0xF1EDE3, opacity: 0.5, darkOpacity: 0.4)
    public static let amberInk = adaptive(0x94602A, 0xE0A860)
    public static let amberBg = adaptive(0xF2E4C8, 0x2A2116)
    public static let successBg = adaptive(0xE4EAD8, 0x1A241C)
    public static let dangerInk = adaptive(0x983224, 0xE08C7E)
    public static let dangerBg = adaptive(0xF4E2DA, 0x2C1A16)
    // The phase accents, each lifted from its own web phase module
    // (`CONNECT_COLOR` in lib/curriculum/connect.ts, and so on), which is where
    // a phase accent lives there — so there is nothing in lib/theme.ts to
    // mirror. The redesign retuned them to period pigments in the same hue
    // families. The dark half is this platform's.
    public static let connectInk = adaptive(0x7A5A82, 0xBFA0D0)
    public static let connectBg = adaptive(0x7A5A82, 0xBFA0D0, opacity: 0.08, darkOpacity: 0.14)
    public static let connectBorder = adaptive(0x7A5A82, 0xBFA0D0, opacity: 0.35, darkOpacity: 0.45)
    public static let discriminateInk = adaptive(0x4A5D70, 0x8FAFCF)
    public static let discriminateBg = adaptive(0x4A5D70, 0x8FAFCF, opacity: 0.08, darkOpacity: 0.14)
    public static let discriminateBorder = adaptive(0x4A5D70, 0x8FAFCF, opacity: 0.32, darkOpacity: 0.42)
    /// Provenance — an archival sepia.
    public static let provenanceInk = adaptive(0x7D6243, 0xCFAF86)
    public static let provenanceBg = adaptive(0x7D6243, 0xCFAF86, opacity: 0.08, darkOpacity: 0.14)
    public static let provenanceBorder = adaptive(0x7D6243, 0xCFAF86, opacity: 0.32, darkOpacity: 0.42)
    /// Steelman — a contested indigo.
    public static let steelmanInk = adaptive(0x4D5B94, 0x9FADE0)
    public static let steelmanBg = adaptive(0x4D5B94, 0x9FADE0, opacity: 0.08, darkOpacity: 0.14)
    public static let steelmanBorder = adaptive(0x4D5B94, 0x9FADE0, opacity: 0.32, darkOpacity: 0.42)
    /// Produce — a spoken terracotta.
    public static let produceInk = adaptive(0xA45A3A, 0xE0A184)
    public static let produceBg = adaptive(0xA45A3A, 0xE0A184, opacity: 0.08, darkOpacity: 0.14)
    public static let produceBorder = adaptive(0xA45A3A, 0xE0A184, opacity: 0.32, darkOpacity: 0.42)
    public static let predictInk = adaptive(0x5A4F7D, 0xA79FD0)
    public static let predictBg = adaptive(0x5A4F7D, 0xA79FD0, opacity: 0.08, darkOpacity: 0.14)
    public static let predictBorder = adaptive(0x5A4F7D, 0xA79FD0, opacity: 0.32, darkOpacity: 0.42)
    public static let traceInk = adaptive(0x3D6E62, 0x74BFA9)
    public static let traceBg = adaptive(0x3D6E62, 0x74BFA9, opacity: 0.08, darkOpacity: 0.14)
    public static let traceBorder = adaptive(0x3D6E62, 0x74BFA9, opacity: 0.32, darkOpacity: 0.42)
    public static let performInk = adaptive(0x4B6B3A, 0x74BF96)
    public static let performBg = adaptive(0x4B6B3A, 0x74BF96, opacity: 0.08, darkOpacity: 0.14)
    public static let performBorder = adaptive(0x4B6B3A, 0x74BF96, opacity: 0.32, darkOpacity: 0.42)
    public static let drillInk = adaptive(0x8E5A2B, 0xD89F63)
    public static let drillBg = adaptive(0x8E5A2B, 0xD89F63, opacity: 0.08, darkOpacity: 0.14)
    public static let drillBorder = adaptive(0x8E5A2B, 0xD89F63, opacity: 0.32, darkOpacity: 0.42)
    public static let recallInk = adaptive(0x56657A, 0x9AABC6)
    public static let recallBg = adaptive(0x56657A, 0x9AABC6, opacity: 0.08, darkOpacity: 0.14)
    public static let recallBorder = adaptive(0x56657A, 0x9AABC6, opacity: 0.32, darkOpacity: 0.42)
    public static let crucibleInk = adaptive(0x962C22, 0xE08078)
    public static let crucibleBg = adaptive(0x962C22, 0xE08078, opacity: 0.08, darkOpacity: 0.14)
    public static let crucibleBorder = adaptive(0x962C22, 0xE08078, opacity: 0.28, darkOpacity: 0.38)
    /// A rule drawn in the text colour at a whisper. It follows `ink` across the
    /// appearance — black on paper, bone on the dark ground — and carries more
    /// alpha there, where a hairline has less contrast to spend.
    public static let hairline = adaptive(0x2B2118, 0xF1EDE3, opacity: 0.12, darkOpacity: 0.14)
    public static let hairlineStrong = adaptive(0x2B2118, 0xF1EDE3, opacity: 0.18, darkOpacity: 0.20)

    /// The colour a raised surface casts, at the weight the caller wants.
    /// Deliberately not `ink`: that token inverts with the appearance, and a
    /// shadow drawn in a light ink is a glow. Black in both schemes, heavier in
    /// the dark one, where there is less ground for a shadow to darken.
    public static func shade(_ opacity: Double) -> Color {
        adaptive(0x2B2118, 0x000000, opacity: opacity, darkOpacity: min(opacity * 3, 1))
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

/// The four faces, as on the web (`font` in lib/theme.ts). All ship as TTFs in
/// `App/Resources/Fonts/` listed in `UIAppFonts`; the two variable ones expose
/// their named cuts, so `.weight()` resolves to a real cut.
public enum Face: String {
    /// IM Fell English: titles, the engraved voice of the atlas.
    case display = "IM FELL English"
    /// IM Fell English SC: kickers and labels, as engraved small capitals —
    /// and the buttons, which the web strikes in the same caps.
    case caps = "IM FELL English SC"
    /// EB Garamond: everything that is read.
    case serif = "EB Garamond"
    /// Instrument Sans: only dense controls — fields, chips, switches.
    case sans = "Instrument Sans"
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
    /// A plate pasted onto the page: an engraving has corners, not curves.
    public static let cardRadius: CGFloat = 3
    /// An answer field, or a choice drawn as one.
    public static let fieldRadius: CGFloat = 3
    /// A phase's tinted panel — the case, the claim, the rep.
    public static let panelRadius: CGFloat = 3
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
