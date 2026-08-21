import AVFoundation
import Observation
import Speech

/// Voice, both directions. Two small platform wrappers — the app adds no
/// dependency for either, and both follow the interface language rather than
/// offering a second choice.

/// Read-aloud. The audio comes from `/api/speech` (the provider key never
/// leaves the server); this only plays it.
///
/// ponytail: one clip at a time, no word highlighting and no queue. The marks
/// are on the wire already — read them when a screen reads along.
@Observable
@MainActor
public final class Speaker {
    public private(set) var speaking = false
    /// True while the clip is being synthesized — a tap that looks like nothing
    /// happened is the failure mode read-aloud actually has.
    public private(set) var loading = false
    private var player: AVAudioPlayer?
    /// The synthesis in flight. Held so a second tap cancels it — a clip that
    /// starts playing after the learner has already stopped it is the failure
    /// this whole toggle exists to avoid.
    private var clip: Task<Void, Never>?

    public init() {}

    public func toggle(_ text: String, api: AtlasAPI) {
        if speaking || loading { return stop() }
        loading = true
        clip = Task {
            defer { loading = false }
            guard let audio = try? await api.speech(text), !Task.isCancelled,
                  let player = try? AVAudioPlayer(data: audio) else {
                return
            }
            // Dictation leaves the shared session on `.record`, which plays this
            // back into silence. Whoever speaks last says what the session is for.
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            try? AVAudioSession.sharedInstance().setActive(true)
            self.player = player
            player.play()
            speaking = true
            // No delegate for one boolean: the clip's own duration is when it
            // stops, and a stray tap on `stop` clears the flag either way.
            try? await Task.sleep(for: .seconds(player.duration))
            if self.player === player { stop() }
        }
    }

    public func stop() {
        clip?.cancel()
        clip = nil
        player?.stop()
        player = nil
        speaking = false
        loading = false
    }
}

/// Dictation, for every free-text answer in the spiral. Delivers the whole
/// transcription once, on stop: a field that rewrites itself under the
/// learner's cursor while they think is worse than one that waits.
@Observable
@MainActor
public final class Dictation {
    public private(set) var listening = false
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var transcript = ""

    public init() {}

    public func toggle(onText: @escaping (String) -> Void) {
        listening ? stop(onText) : start()
    }

    private func start() {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: AtlasAPI.language)),
              recognizer.isAvailable else { return }
        // The TCC reply lands on a background queue. The closure must carry no
        // main-actor isolation of its own or Swift 6 traps on entry, before the
        // hop below can happen — hence @Sendable, and the unsafe capture of the
        // recognizer, which is not Sendable but is only read on the main actor.
        nonisolated(unsafe) let ready = recognizer
        SFSpeechRecognizer.requestAuthorization { @Sendable status in
            Task { @MainActor in
                guard status == .authorized else { return }
                self.listen(ready)
            }
        }
    }

    private func listen(_ recognizer: SFSpeechRecognizer) {
        transcript = ""
        // The buffer request is handed to an audio-thread tap and to the
        // recognizer's own queue; neither is Sendable and both are the API's
        // documented use, so the crossing is stated rather than hidden.
        nonisolated(unsafe) let request = SFSpeechAudioBufferRecognitionRequest()
        // Partial results, but nothing is delivered until the learner stops:
        // the running transcript is what `stop` has to read, since the final
        // result lands after the task is finished.
        request.shouldReportPartialResults = true
        try? AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        guard (try? engine.start()) != nil else { return input.removeTap(onBus: 0) }
        listening = true
        task = recognizer.recognitionTask(with: request) { @Sendable result, _ in
            // Only the string crosses back — the result object stays on the
            // recognizer's queue.
            let text = result?.bestTranscription.formattedString
            Task { @MainActor in if let text { self.transcript = text } }
        }
    }

    private func stop(_ onText: (String) -> Void) {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        task?.finish()
        task = nil
        listening = false
        // Give the shared session back, or read-aloud on the next screen plays
        // into a session still configured to record.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let said = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        transcript = ""
        if !said.isEmpty { onText(said) }
    }
}
