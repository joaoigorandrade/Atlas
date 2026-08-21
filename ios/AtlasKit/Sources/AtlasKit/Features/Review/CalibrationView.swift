import Navigation
import SwiftUI

/// "Calibração" — confidence against delivery. The desktop's 268pt rail is a
/// header icon on the Review bar; the reading sits *below* the curve here.
struct CalibrationView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: CalibrationViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .navigationBarBackButtonHidden()
        .toolbar(.hidden, for: .navigationBar)
        .task { if model == nil { model = CalibrationViewModel(store: store) } }
    }

    private func content(_ model: CalibrationViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                HStack(spacing: 10) {
                    BackButton { navigator.pop() }
                    VStack(alignment: .leading, spacing: 2) {
                        Kicker("Calibração", tint: NodeState.shaky.color, size: 9.5)
                        Text("Confiança vs. desempenho")
                            .font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
                    }
                }
                .padding(.leading, -12)
            }

            if model.isEmpty {
                Waiting("Ainda sem leituras — cada toque de confiança antes de virar um cartão constrói essa curva.",
                        spinning: false)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        curve(model)
                        Kicker("O que a curva diz").padding(.top, 22)
                        VStack(spacing: 10) {
                            ForEach(model.items) { row($0, model) }
                        }
                        .padding(.top, 12)
                    }
                    .padding(.horizontal, Metrics.gutter)
                    .padding(.top, 18)
                    .padding(.bottom, 28)
                }
            }
        }
    }

    // MARK: - The curve

    private func curve(_ model: CalibrationViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Curva de calibração")
            Text("Onde sua confiança passa do que você entrega")
                .font(.atlas(.serif, 18)).foregroundStyle(Palette.ink).padding(.top, 4)
            Canvas { context, size in plot(&context, size, model) }
                .frame(height: 260)
                .padding(.top, 14)
                .accessibilityLabel("Curva de confiança contra desempenho, \(model.items.count) leituras")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Palette.hairline, lineWidth: 1) }
    }

    /// Stated confidence runs left to right, delivery bottom to top, so the
    /// diagonal is perfect calibration and everything under it is bravado.
    private func plot(_ context: inout GraphicsContext, _ size: CGSize, _ model: CalibrationViewModel) {
        let inset: CGFloat = 14
        let plot = CGRect(x: inset, y: inset, width: size.width - inset * 2, height: size.height - inset * 2)
        func point(_ felt: Int, _ real: Int) -> CGPoint {
            CGPoint(x: plot.minX + plot.width * CGFloat(felt) / 100,
                    y: plot.maxY - plot.height * CGFloat(real) / 100)
        }

        var over = Path()
        over.move(to: CGPoint(x: plot.minX, y: plot.maxY))
        over.addLine(to: CGPoint(x: plot.maxX, y: plot.maxY))
        over.addLine(to: CGPoint(x: plot.maxX, y: plot.minY))
        context.fill(over, with: .color(NodeState.shaky.color.opacity(0.07)))
        var under = Path()
        under.move(to: CGPoint(x: plot.minX, y: plot.maxY))
        under.addLine(to: CGPoint(x: plot.minX, y: plot.minY))
        under.addLine(to: CGPoint(x: plot.maxX, y: plot.minY))
        context.fill(under, with: .color(NodeState.learning.color.opacity(0.07)))

        var diagonal = Path()
        diagonal.move(to: CGPoint(x: plot.minX, y: plot.maxY))
        diagonal.addLine(to: CGPoint(x: plot.maxX, y: plot.minY))
        context.stroke(diagonal, with: .color(Palette.ink.opacity(0.4)),
                       style: StrokeStyle(lineWidth: 1.5, dash: [5, 5]))

        context.draw(Text("SUBESTIMA").font(.atlas(.mono, 9.5)).foregroundStyle(NodeState.learning.color),
                     at: CGPoint(x: plot.minX + 46, y: plot.minY + 14))
        context.draw(Text("SUPERESTIMA").font(.atlas(.mono, 9.5)).foregroundStyle(NodeState.shaky.color),
                     at: CGPoint(x: plot.maxX - 46, y: plot.maxY - 14))

        for item in model.items {
            let at = point(item.felt, item.real)
            let radius: CGFloat = item.verdict == .ok ? 5 : 6.5
            context.fill(
                Path(ellipseIn: CGRect(x: at.x - radius, y: at.y - radius, width: radius * 2, height: radius * 2)),
                with: .color(item.verdict.tint.opacity(item.verdict == .ok ? 0.75 : 1))
            )
        }
        if let worst = model.worst {
            let at = point(worst.felt, worst.real)
            context.draw(Text(verbatim: worst.label).font(.atlas(.serif, 10.5)).foregroundStyle(Palette.inkMuted),
                         at: CGPoint(x: at.x, y: min(at.y + 18, plot.maxY)))
        }
    }

    // MARK: - What it says

    private func row(_ item: CalibItem, _ model: CalibrationViewModel) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Kicker(item.verdict.label, tint: item.verdict.tint, size: 10)
            Text(verbatim: item.label).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
            Text(model.reading(item))
                .font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted).lineSpacing(3)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card)
        .overlay(alignment: .leading) { Rectangle().fill(item.verdict.tint).frame(width: 3) }
        .clipShape(.rect(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
