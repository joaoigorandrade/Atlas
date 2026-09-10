import SwiftUI

/// Every wait in the app, in one place. A generation is the slowest thing the
/// learner ever asks for, so the wait is drawn — never a UIKit spinner dropped
/// on paper — and it is drawn as *the thing being waited for*: the paragraph
/// rhythm of a reading, the web of a Connect answer. Screens compose `Waiting`;
/// the pieces below are what it is made of.

/// The app's own indeterminate wait — three ink dots riding a wave. It is the
/// beat under every "still working" sentence, and the same one the launch
/// screen and the two inline "judging" rows wear.
public struct AtlasPulse: View {
    private let tint: Color
    private let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(tint: Color = Palette.inkFaint, size: CGFloat = 20) {
        self.tint = tint; self.size = size
    }

    public var body: some View {
        let dot = size * 0.27
        Group {
            if reduceMotion {
                // The wave is the whole animation, so Reduce Motion gets the
                // dots at rest rather than a slower wave.
                HStack(spacing: dot * 0.8) {
                    ForEach(0..<3, id: \.self) { _ in circle(dot, lift: 0, amount: 0.55) }
                }
            } else {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    HStack(spacing: dot * 0.8) {
                        ForEach(0..<3, id: \.self) { index in
                            // Each dot is the same swell, a fifth of a turn
                            // behind the one to its left — a wave travelling
                            // the row, not three lights blinking together.
                            let phase = sin((t / 1.05 - Double(index) * 0.16) * 2 * .pi)
                            let amount = max(0, phase)
                            circle(dot, lift: -dot * 0.42 * amount, amount: 0.3 + 0.7 * amount)
                        }
                    }
                }
            }
        }
        .frame(height: size)
        .accessibilityLabel("Carregando")
    }

    private func circle(_ dot: CGFloat, lift: CGFloat, amount: Double) -> some View {
        Circle()
            .fill(tint)
            .frame(width: dot, height: dot)
            .scaleEffect(0.74 + 0.26 * amount)
            .opacity(amount)
            .offset(y: lift)
    }
}

/// Prose that hasn't landed yet, in the shape it will land in — the paragraph
/// rhythm of a reading, so the screen doesn't jump from an empty box to a wall
/// of text. Each line is *written*: it grows from the left margin a beat after
/// the one above it, a caret holds the end of the last one, and a soft sheen
/// crosses the block about once a second. Under Reduce Motion the bars simply
/// sit there at full width, which is still the right shape.
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
            .overlay { if !reduceMotion { sheen } }
            // The sheen is painted over the whole block and then cut to the
            // bars, so it lights the text lines and never the gaps.
            .mask { bars }
            .overlay(alignment: .topLeading) { if !reduceMotion { caret } }
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
                    Capsule()
                        .fill(Palette.hairline)
                        // The line writes itself in from the margin rather than
                        // fading in whole — the same thing the sentence under
                        // the block says Atlas is doing.
                        .frame(width: geo.size.width * line.width * (drawn ? 1 : 0.04))
                }
                .frame(height: 11)
                .padding(.top, line.gap)
                .opacity(drawn ? 1 : 0)
                .animation(
                    reduceMotion ? nil : Motion.enter.delay(Double(index) * 0.07),
                    value: settled
                )
            }
        }
    }

    private var drawn: Bool { settled || reduceMotion }

    /// The blinking end of the last line — the one part of the block that says
    /// the writing is still happening rather than merely unfinished.
    private var caret: some View {
        GeometryReader { geo in
            let last = lines.last?.width ?? 1
            let height = CGFloat(lines.count) * 11 + lines.dropFirst().map(\.gap).reduce(0, +)
            Caret()
                .frame(width: 2, height: 13)
                .offset(x: geo.size.width * last * (drawn ? 1 : 0.04) + 3, y: height - 12)
                .animation(Motion.enter.delay(Double(lines.count - 1) * 0.07), value: settled)
        }
    }

    private var sheen: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [
                    .clear,
                    Palette.accent.opacity(0.16),
                    Palette.paper.opacity(0.95),
                    Palette.accent.opacity(0.16),
                    .clear,
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(width: geo.size.width * 0.55)
            .blur(radius: 5)
            .offset(x: sweeping ? geo.size.width * 1.1 : -geo.size.width * 0.6)
            .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false), value: sweeping)
        }
    }
}

/// A writing caret, blinking on its own clock so nothing around it has to carry
/// a repeating animation.
private struct Caret: View {
    @State private var lit = false
    var body: some View {
        Capsule()
            .fill(Palette.accent)
            .opacity(lit ? 1 : 0.05)
            .animation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true), value: lit)
            .task { lit = true }
    }
}

/// The shape a Connect answer takes: a handful of concepts and the links
/// between them. The links carry a current while the answer is being found, and
/// the nodes breathe — paragraph bars here promised a screen it never becomes.
struct SkeletonWeb: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Unit coordinates inside the card — one concept in the middle, the ones
    /// it is being connected to around it.
    private let nodes: [CGPoint] = [
        CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.17, y: 0.27), CGPoint(x: 0.83, y: 0.31),
        CGPoint(x: 0.24, y: 0.79), CGPoint(x: 0.78, y: 0.73), CGPoint(x: 0.5, y: 0.13),
    ]
    private let edges = [(0, 1), (0, 2), (0, 3), (0, 4), (0, 5), (1, 5), (2, 5)]

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.cardRadius)
            .fill(Palette.cardAlt)
            .aspectRatio(560.0 / 440.0, contentMode: .fit)
            .overlay {
                if reduceMotion {
                    Canvas { context, size in draw(context, size, t: 0) }
                } else {
                    TimelineView(.animation) { frame in
                        Canvas { context, size in
                            draw(context, size, t: frame.date.timeIntervalSinceReferenceDate)
                        }
                    }
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: Metrics.cardRadius)
                    .strokeBorder(Palette.hairline, lineWidth: 1)
            }
            .accessibilityHidden(true)
    }

    private func draw(_ context: GraphicsContext, _ size: CGSize, t: TimeInterval) {
        let point = { (node: CGPoint) in
            CGPoint(x: node.x * size.width, y: node.y * size.height)
        }
        for (index, edge) in edges.enumerated() {
            var path = Path()
            path.move(to: point(nodes[edge.0]))
            path.addLine(to: point(nodes[edge.1]))
            // A dash pattern walked along the link: the connection is being
            // traced, not sitting there drawn.
            context.stroke(
                path,
                with: .color(Palette.hairlineStrong),
                style: StrokeStyle(
                    lineWidth: 1.2, lineCap: .round,
                    dash: [3, 7], dashPhase: -t * 16 + Double(index) * 4
                )
            )
        }
        for (index, node) in nodes.enumerated() {
            let swell = max(0, sin((t / 1.6 - Double(index) * 0.12) * 2 * .pi))
            let radius = (index == 0 ? 9.0 : 6.0) * (0.86 + 0.14 * swell)
            let centre = point(node)
            let box = CGRect(
                x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2
            )
            context.fill(
                Path(ellipseIn: box),
                with: .color(index == 0 ? Palette.accent.opacity(0.55) : Palette.inkGhost.opacity(0.45 + 0.35 * swell))
            )
        }
    }
}

/// The app's own indeterminate bar — a hairline rule with a lit segment
/// travelling it, brightest at its head. `ProgressView(.linear)` is UIKit's,
/// and it reads as a system alert in the middle of paper.
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
                        .fill(
                            LinearGradient(
                                colors: [
                                    Palette.accent.opacity(0.12), Palette.accent.opacity(0.55),
                                    Palette.accent,
                                ],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
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
    /// What is being waited *for*. Prose is the default because most phases are
    /// prose; Connect resolves into a diagram.
    enum Shape { case prose, web }
    private let text: Text
    /// A failure is not a wait: the shape and the dots come off when the
    /// sentence on screen is the reason nothing is coming.
    private let spinning: Bool
    private let shape: Shape
    /// A generation that lands in a few hundred milliseconds should look
    /// instant, not like a skeleton that flashed. Held back one beat.
    @State private var shown = false
    /// The sentence answers the shape a beat later — see `body`.
    @State private var narrating = false
    init(_ key: LocalizedStringKey, spinning: Bool = true, shape: Shape = .prose) {
        text = Text(key); self.spinning = spinning; self.shape = shape
    }
    /// The sentence a view model already resolved — an `ErrorCopy` line, or a
    /// wait it picked between several. Localised there, not here.
    init(verbatim: String, spinning: Bool = true, shape: Shape = .prose) {
        text = Text(verbatim: verbatim); self.spinning = spinning; self.shape = shape
    }
    var body: some View {
        VStack(alignment: spinning ? .leading : .center, spacing: 20) {
            if spinning {
                held.padding(.top, 30)
                // The sentence sits under the shape, on the same left edge as
                // the prose it stands in for — a caption centred against
                // left-aligned bars is the thing that reads as unfinished.
                HStack(spacing: 9) {
                    AtlasPulse(size: 17)
                    sentence(.leading)
                }
                // It rises into place rather than appearing, which is the same
                // move generated material makes when it replaces this screen.
                .opacity(narrating ? 1 : 0)
                .offset(y: narrating ? 0 : 8)
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

    /// The place the answer will take, at the answer's own shape.
    @ViewBuilder
    private var held: some View {
        switch shape {
        case .prose: SkeletonLines()
        case .web: SkeletonWeb()
        }
    }

    private func sentence(_ alignment: TextAlignment) -> some View {
        text.font(.atlas(.sans, 13.5))
            .foregroundStyle(Palette.inkMuted)
            .multilineTextAlignment(alignment)
    }
}
