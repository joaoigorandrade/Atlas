import PencilKit
import SwiftUI

/// A sheet to draw the run on — a diagram, a construction, boxes and arrows.
/// The checker reads it as an image beside the written work (the web's
/// `SketchPad`). Finger or Pencil both draw; undo is the canvas's own.
///
/// ponytail: one pen, one ink, no tool picker. Add `PKToolPicker` when a
/// learner asks for colours or an eraser.
struct SketchCanvas: UIViewRepresentable {
    @Binding var drawing: PKDrawing

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawingPolicy = .anyInput
        canvas.tool = PKInkingTool(.pen, color: .label, width: 3)
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawing = drawing
        canvas.delegate = context.coordinator
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        // Only an outside change (Clear, a new case) is pushed in; the canvas's
        // own strokes arrive through the delegate.
        if canvas.drawing != drawing { canvas.drawing = drawing }
    }

    func makeCoordinator() -> Coordinator { Coordinator(drawing: $drawing) }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let drawing: Binding<PKDrawing>
        init(drawing: Binding<PKDrawing>) { self.drawing = drawing }
        func canvasViewDrawingDidChange(_ canvas: PKCanvasView) { drawing.wrappedValue = canvas.drawing }
    }
}

extension PKDrawing {
    /// The drawing as the PNG data URL the judge reads: dark ink on white
    /// whatever the appearance — a dark-mode render is white on transparent,
    /// which a model reads as nothing. Nil when there is nothing drawn.
    var judgeDataURL: String? {
        guard !strokes.isEmpty else { return nil }
        let rect = bounds.insetBy(dx: -24, dy: -24)
        let light = UITraitCollection(userInterfaceStyle: .light)
        var ink: UIImage!
        light.performAsCurrent { ink = image(from: rect, scale: 2) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let png = UIGraphicsImageRenderer(size: rect.size, format: format).pngData { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: rect.size))
            ink.draw(at: .zero)
        }
        return "data:image/png;base64,\(png.base64EncodedString())"
    }
}
