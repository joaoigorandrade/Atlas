import Navigation
import SwiftUI

/// The session shell: one screen at a time, in spiral order, over the map that
/// pushed it. It holds no state of its own — `SessionViewModel` says which phase
/// is on screen, and each phase screen owns the content it renders.
struct SessionView: View {
    let node: ConceptNode
    /// Non-nil when the map asked for one particular phase again — a redo.
    var phase: Phase?
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    /// Built once, in `task`: a pass marks its node Learning on the way in, so
    /// re-making it during a view update would re-run that write every redraw.
    @State private var session: SessionViewModel?

    var body: some View {
        Group {
            if let session {
                phase(session)
                    // The spiral only ever moves forward: each phase arrives
                    // from the right over the one it replaces.
                    .id(session.phase)
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
                    .animation(Motion.enter, value: session.phase)
                    // Past the Crucible there is no next phase — the pass is
                    // over and the map takes the screen back.
                    .onChange(of: session.finished) { _, over in if over { navigator.pop() } }
            } else {
                Color.clear
            }
        }
        .background(Palette.paper)
        // A pass owns the whole screen, tab bar included: it has its own top bar
        // and its own way back.
        .toolbar(.hidden, for: .tabBar)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden()
        .task { if session == nil { session = SessionViewModel(node: node, store: store, phase: phase) } }
    }

    @ViewBuilder
    private func phase(_ session: SessionViewModel) -> some View {
        switch session.phase {
        case .consume: ConsumeView(session: session)
        case .socratic: SocraticView(session: session)
        case .feynman: FeynmanView(session: session)
        case .connect: ConnectView(session: session)
        case .crucible: CrucibleView(session: session)
        case .retained: Pending("Revisão")
        }
    }
}
