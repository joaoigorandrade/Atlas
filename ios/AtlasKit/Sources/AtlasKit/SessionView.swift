import SwiftUI

/// The session shell: one screen at a time, in spiral order, over the map that
/// pushed it. It holds no state of its own — `Session` says which phase is on
/// screen, and each phase screen owns the content it renders.
struct SessionView: View {
    @State var session: Session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            switch session.phase {
            case .consume: ConsumeView(session: session)
            case .socratic: SocraticView(session: session)
            case .feynman: FeynmanView(session: session)
            case .connect: ConnectView(session: session)
            case .crucible: CrucibleView(session: session)
            case .retained: Pending("Revisão")
            }
        }
        .animation(Motion.standard, value: session.phase)
        // Past the Crucible there is no next phase — the pass is over and the
        // map takes the screen back.
        .onChange(of: session.finished) { _, over in if over { dismiss() } }
    }
}
