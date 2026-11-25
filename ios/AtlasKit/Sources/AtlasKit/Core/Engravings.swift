import SwiftUI

/// The app's long waits, drawn as an engraver would: one plate per context,
/// the same set as the web's `components/Engravings.tsx`. The compass while
/// Atlas finds its bearings (launch), a coast being charted while a map is
/// made or switched, and the needle (`AtlasPulse`) inline everywhere else.
///
/// Each plate is one `Canvas` on a `TimelineView` clock, so nothing carries a
/// repeating SwiftUI animation. Under Reduce Motion each draws its finished
/// engraving, still: the plate is the mark, the movement is a flourish.
enum Engrave {
    /// How much of a stroke is cut at `t`: drawn over 70% of `period`, held,
    /// then un-drawn on the way back (CSS `alternate`), so it never snaps.
    static func cut(_ t: Double, delay: Double, period: Double) -> Double {
        let local = t - delay
        guard local > 0 else { return 0 }
        let cycle = local / period
        let frac = cycle - cycle.rounded(.down)
        let u = Int(cycle) % 2 == 0 ? frac : 1 - frac
        return smooth(min(u / 0.7, 1))
    }

    /// A wash laid after the strokes it fills: 45%–80% of the same cycle.
    static func wash(_ t: Double, delay: Double, period: Double) -> Double {
        let local = t - delay
        guard local > 0 else { return 0 }
        let cycle = local / period
        let frac = cycle - cycle.rounded(.down)
        let u = Int(cycle) % 2 == 0 ? frac : 1 - frac
        return smooth(min(max((u - 0.45) / 0.35, 0), 1))
    }

    /// A needle finding north: a damped swing, then rest — the web's
    /// `needleSeek` keyframes, in degrees.
    static func seek(_ t: Double, delay: Double = 0, period: Double) -> Double {
        let local = max(0, t - delay)
        let u = (local / period).truncatingRemainder(dividingBy: 1)
        let keys: [(Double, Double)] = [(0, 0), (0.12, 28), (0.26, -20), (0.38, 12), (0.48, -6), (0.56, 2), (0.62, 0), (1, 0)]
        for (a, b) in zip(keys, keys.dropFirst()) where u <= b.0 {
            return a.1 + (b.1 - a.1) * smooth((u - a.0) / (b.0 - a.0))
        }
        return 0
    }

    static func smooth(_ x: Double) -> Double { x * x * (3 - 2 * x) }
}

/// A plate's clock: live, or parked at a time where everything is cut.
private struct Plate<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let content: (_ t: Double, _ still: Bool) -> Content

    var body: some View {
        Group {
            if reduceMotion {
                content(0, true)
            } else {
                TimelineView(.animation) { frame in
                    content(frame.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600), false)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

private func polar(_ deg: Double, _ r: Double) -> CGPoint {
    let a = (deg - 90) * .pi / 180
    return CGPoint(x: 50 + r * cos(a), y: 50 + r * sin(a))
}

/// Launch: a compass rose engraving itself, its needle seeking north.
public struct CompassRose: View {
    private let size: CGFloat
    @State private var start = Date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
    public init(size: CGFloat = 72) { self.size = size }

    public var body: some View {
        Plate { now, still in
            Canvas { context, canvas in
                context.scaleBy(x: canvas.width / 100, y: canvas.height / 100)
                // Measured from when the rose appeared, so it always starts blank.
                let t = now - start
                let cut = { (delay: Double) in still ? 1 : Engrave.cut(t, delay: delay, period: 3.2) }
                let wash = { (delay: Double) in still ? 1 : Engrave.wash(t, delay: delay, period: 3.2) }
                let ring = { (r: Double) in Path(ellipseIn: CGRect(x: 50 - r, y: 50 - r, width: r * 2, height: r * 2)) }

                context.stroke(ring(47).trimmedPath(from: 0, to: cut(0)), with: .color(Palette.inkSoft), lineWidth: 0.9)
                context.stroke(ring(42).trimmedPath(from: 0, to: cut(0.15)), with: .color(Palette.inkFaint), lineWidth: 0.6)
                context.stroke(
                    ring(44.5), with: .color(Palette.inkGhost.opacity(wash(0.3))),
                    style: StrokeStyle(lineWidth: 2.2, dash: [0.4, 2.2])
                )
                // Ordinals first, faint; then the cardinals, north (gilt) last.
                for (i, deg) in [45.0, 135, 225, 315].enumerated() {
                    let delay = 0.4 + Double(i) * 0.08
                    point(context, deg, 24, 5, fill: Palette.inkGhost, line: Palette.inkFaint, width: 0.7, cut: cut(delay), wash: wash(delay + 0.2))
                }
                for (i, deg) in [0.0, 90, 180, 270].enumerated() {
                    let delay = i == 0 ? 0.95 : 0.6 + Double(i) * 0.1
                    point(context, deg, 38, 7, fill: i == 0 ? Palette.gilt : Palette.inkSoft, line: Palette.ink, width: 0.9, cut: cut(delay), wash: wash(delay + 0.2))
                }

                var needle = context
                needle.translateBy(x: 50, y: 50)
                needle.rotate(by: .degrees(still ? 0 : Engrave.seek(t, delay: 1.2, period: 2.6)))
                var lozenge = Path()
                lozenge.addLines([CGPoint(x: 0, y: -30), CGPoint(x: 2.2, y: 0), CGPoint(x: 0, y: 4), CGPoint(x: -2.2, y: 0)])
                lozenge.closeSubpath()
                needle.fill(lozenge, with: .color(Palette.rubric.opacity(0.85)))
                let pin = Path(ellipseIn: CGRect(x: -2.2, y: -2.2, width: 4.4, height: 4.4))
                needle.fill(pin, with: .color(Palette.paper))
                needle.stroke(pin, with: .color(Palette.ink), lineWidth: 0.8)
            }
        }
        .frame(width: size, height: size)
    }

    private func point(
        _ context: GraphicsContext, _ deg: Double, _ length: Double, _ shoulder: Double,
        fill: Color, line: Color, width: CGFloat, cut: Double, wash: Double
    ) {
        let centre = CGPoint(x: 50, y: 50)
        var shade = Path()
        shade.addLines([centre, polar(deg - 45, shoulder), polar(deg, length)])
        shade.closeSubpath()
        context.fill(shade, with: .color(fill.opacity(wash)))
        var outline = Path()
        outline.addLines([centre, polar(deg - 45, shoulder), polar(deg, length), polar(deg + 45, shoulder)])
        outline.closeSubpath()
        context.stroke(outline.trimmedPath(from: 0, to: cut), with: .color(line), style: StrokeStyle(lineWidth: width, lineJoin: .round))
    }
}

/// Map building and switching: a coast inked in, a route marching between
/// survey points. `compact` is the inline size, for a header slot.
public struct ChartingMark: View {
    private let compact: Bool
    @State private var start = Date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
    public init(compact: Bool = false) { self.compact = compact }

    private static let coast: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 4, y: 36))
        p.addCurve(to: CGPoint(x: 52, y: 34), control1: CGPoint(x: 22, y: 30), control2: CGPoint(x: 34, y: 41))
        p.addCurve(to: CGPoint(x: 98, y: 28), control1: CGPoint(x: 70, y: 27), control2: CGPoint(x: 78, y: 22))
        p.addCurve(to: CGPoint(x: 146, y: 33), control1: CGPoint(x: 118, y: 34), control2: CGPoint(x: 124, y: 40))
        p.addCurve(to: CGPoint(x: 196, y: 27), control1: CGPoint(x: 168, y: 26), control2: CGPoint(x: 176, y: 20))
        p.addCurve(to: CGPoint(x: 256, y: 29), control1: CGPoint(x: 216, y: 34), control2: CGPoint(x: 232, y: 38))
        return p
    }()

    private static let route: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 44, y: 19))
        p.addQuadCurve(to: CGPoint(x: 130, y: 13), control: CGPoint(x: 87, y: 3))
        p.addQuadCurve(to: CGPoint(x: 216, y: 15), control: CGPoint(x: 173, y: 23))
        return p
    }()

    private static let survey = [CGPoint(x: 44, y: 19), CGPoint(x: 130, y: 13), CGPoint(x: 216, y: 15)]

    public var body: some View {
        Plate { now, still in
            Canvas { context, canvas in
                let scale = canvas.width / 260
                context.scaleBy(x: scale, y: scale)
                // Strokes keep their weight at the compact size.
                let weight = 1 / max(scale, 0.35)
                let t = now - start
                for (i, y) in [40.0, 43.5, 47].enumerated() {
                    var water = Path()
                    water.move(to: CGPoint(x: 18 + Double(i) * 14, y: y))
                    water.addLine(to: CGPoint(x: 242 - Double(i) * 14, y: y))
                    let a = still ? 1 : Engrave.wash(t, delay: 0.5 + Double(i) * 0.12, period: 4)
                    context.stroke(water, with: .color(Palette.hairlineStrong.opacity(a)), style: StrokeStyle(lineWidth: 0.7 * weight, dash: [14, 5]))
                }
                let cut = still ? 1 : Engrave.cut(t, delay: 0, period: 4)
                context.stroke(Self.coast.trimmedPath(from: 0, to: cut), with: .color(Palette.inkSoft), style: StrokeStyle(lineWidth: 1.1 * weight, lineCap: .round))
                context.stroke(
                    Self.route, with: .color(Palette.rubric),
                    style: StrokeStyle(lineWidth: weight, lineCap: .round, dash: [2 * weight, 4 * weight], dashPhase: still ? 0 : -(t / 0.9 * 12 * weight))
                )
                for (i, dot) in Self.survey.enumerated() {
                    let s = still ? 1 : stamp(t - (0.6 + Double(i) * 0.45))
                    let r = 3 * weight * s
                    let box = CGRect(x: dot.x - r, y: dot.y - r, width: r * 2, height: r * 2)
                    let opacity = still ? 1 : min(1, s * 1.5)
                    context.fill(Path(ellipseIn: box), with: .color((i == 1 ? Palette.accent : Palette.card).opacity(opacity)))
                    context.stroke(Path(ellipseIn: box), with: .color(Palette.ink.opacity(opacity)), lineWidth: 0.9 * weight)
                }
            }
        }
        .aspectRatio(260.0 / 48.0, contentMode: .fit)
        .frame(maxWidth: compact ? 72 : 260)
    }

    /// A survey point stamped onto the chart: it overshoots and settles, and
    /// lifts off again on the way back (the web's `survey`, alternating).
    private func stamp(_ local: Double) -> Double {
        guard local > 0 else { return 0 }
        let cycle = local / 4
        let frac = cycle - cycle.rounded(.down)
        let u = Int(cycle) % 2 == 0 ? frac : 1 - frac
        if u < 0.35 { return 0.3 + (1.3 - 0.3) * Engrave.smooth(u / 0.35) }
        if u < 0.5 { return 1.3 - 0.3 * Engrave.smooth((u - 0.35) / 0.15) }
        return 1
    }
}
