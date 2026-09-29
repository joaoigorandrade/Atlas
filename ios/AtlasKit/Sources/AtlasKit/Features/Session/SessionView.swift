import Navigation
import SwiftUI

/// The session shell: one screen at a time, in spiral order, over the map that
/// pushed it. It holds no state of its own — `SessionViewModel` says which phase
/// is on screen, and each phase screen owns the content it renders.
struct SessionView: View {
    let node: ConceptNode
    /// Non-nil when the map asked for one particular phase again — a redo.
    var phase: Phase?
    var resumed = false
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    /// Built once, in `task`: a pass marks its node Learning on the way in, so
    /// re-making it during a view update would re-run that write every redraw.
    @State private var session: SessionViewModel?
    /// When the phase on screen started counting — reset whenever the app
    /// leaves the foreground, so only time actually spent on it is reported.
    @State private var clockStart: Date?
    @Environment(\.scenePhase) private var scenePhase

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
        .task { if session == nil { session = SessionViewModel(node: node, store: store, phase: phase, resumed: resumed) } }
        // The map has the screen again — by the back swipe, the phase bar, or a
        // finished pass. Whichever it was, there is no pass to reopen next
        // launch. Backgrounding does not come through here, which is the point.
        .onDisappear {
            SessionViewModel.forget()
            session?.summarize()
            if let shown = session?.phase { stopClock(shown) }
        }
        // The phase clock: foreground time only, reported per phase as it
        // closes (`/api/v1/topics/:id/time`) — what the per-cell budgets in
        // `Cells.swift` are tuned against.
        .onChange(of: session?.phase) { old, new in
            if let old { stopClock(old) }
            if new != nil { clockStart = .now }
        }
        .onChange(of: scenePhase) { _, now in
            guard let shown = session?.phase else { return }
            if now == .active { clockStart = .now } else { stopClock(shown) }
        }
    }

    private func stopClock(_ phase: Phase) {
        guard let start = clockStart else { return }
        clockStart = nil
        // Capped like the server: an hour is longer than any honest session.
        let seconds = min(3600, Int(Date.now.timeIntervalSince(start).rounded()))
        store.recordPhaseTime(node, phase, seconds: seconds)
    }

    @ViewBuilder
    private func phase(_ session: SessionViewModel) -> some View {
        switch session.phase {
        case .consume: ConsumeView(session: session)
        case .discriminate: DiscriminateView(session: session)
        case .provenance: ProvenanceView(session: session)
        case .socratic: SocraticView(session: session)
        case .steelman: SteelmanView(session: session)
        case .predict: PredictView(session: session)
        case .trace: TraceView(session: session)
        case .feynman: FeynmanView(session: session)
        case .perform: PerformView(session: session)
        case .drill: DrillView(session: session)
        case .produce: ProduceView(session: session)
        case .connect: ConnectView(session: session)
        case .crucible: CrucibleView(session: session)
        case .recall: RecallView(session: session)
        // Unreachable by construction: `SessionViewModel` clamps to the node's
        // own gates, and Retido is never one of them — Review owns it, and this
        // shell hides the tab bar, the nav bar and the back button, so a screen
        // here without a `PhaseBar` is a screen with no way out.
        case .retain: Color.clear
        }
    }
}
