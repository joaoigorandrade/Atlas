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
    /// Why the last tap did nothing, or empty. A read-aloud that fails in
    /// silence — an expired token, a 429, a section over the route's 4 000
    /// character cap — reads as a dead button, which is the one failure mode
    /// this control actually has.
    public private(set) var message = ""
    private var player: AVAudioPlayer?
    /// The synthesis in flight. Held so a second tap cancels it — a clip that
    /// starts playing after the learner has already stopped it is the failure
    /// this whole toggle exists to avoid.
    private var clip: Task<Void, Never>?

    public init() {}

    /// Speak `segments` in order, packed into requests under the route's cap.
    ///
    /// `self` is captured weakly on purpose: the task parks in `Task.sleep` for
    /// the length of a clip, and a strong capture kept the whole speaker — and
    /// its player — alive and audible over whatever screen the learner went to
    /// next. Screens still stop it explicitly on the way out; this is the
    /// backstop for the ones that forget.
    public func toggle(_ segments: [String], api: AtlasAPI) {
        if speaking || loading { return stop() }
        let clips = Self.batched(segments)
        guard !clips.isEmpty else { return }
        message = ""
        loading = true
        clip = Task { [weak self] in
            for text in clips {
                guard let self, !Task.isCancelled else { return }
                let audio: Data
                do {
                    audio = try await api.speech(text)
                } catch {
                    self.message = ErrorCopy.sentence(
                        for: error, doing: String(localized: "ler esta seção em voz alta")
                    )
                    return self.stop()
                }
                guard !Task.isCancelled, let player = try? AVAudioPlayer(data: audio) else { return }
                // Dictation leaves the shared session on `.record`, which plays
                // this back into silence. Whoever speaks last says what the
                // session is for.
                try? AVAudioSession.sharedInstance().setCategory(.playback)
                try? AVAudioSession.sharedInstance().setActive(true)
                self.player = player
                player.play()
                self.speaking = true
                // The clip is playing, so it is no longer loading: the flag ran
                // to the *end* of the closure before, which drew the control at
                // 40% for the whole time it was speaking.
                self.loading = false
                // No delegate for one boolean: the clip's own duration is when
                // it stops, and a stray tap on `stop` clears the flag either way.
                try? await Task.sleep(for: .seconds(player.duration))
                guard self.player === player else { return }
            }
            self?.stop()
        }
    }

    /// The route caps one request at 4 000 characters
    /// (`app/api/speech/route.ts`), and a five-paragraph section is over it —
    /// which used to fail silently. Sentences are packed into requests under
    /// the cap instead, which also starts the first clip sooner.
    nonisolated static func batched(_ segments: [String], limit: Int = 3_500) -> [String] {
        var clips: [String] = []
        for piece in segments.flatMap(Self.sentences) {
            if let last = clips.last, last.count + piece.count + 1 <= limit {
                clips[clips.count - 1] = last + " " + piece
            } else {
                clips.append(String(piece.prefix(limit)))
            }
        }
        return clips
    }

    /// Sentence-sized pieces, so the packing above never cuts prose mid-word.
    private nonisolated static func sentences(_ text: String) -> [String] {
        let body = text.trimmed
        guard !body.isEmpty else { return [] }
        var pieces: [String] = []
        body.enumerateSubstrings(in: body.startIndex..., options: [.bySentences, .localized]) { piece, _, _, _ in
            if let piece = piece?.trimmed, !piece.isEmpty { pieces.append(piece) }
        }
        return pieces.isEmpty ? [body] : pieces
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

/// Dictation, for every free-text answer in the spiral.  Delivers the whole
/// transcription once, on stop: a field that rewrites itself under the
/// learner's cursor while they think is worse than one that waits.
///
/// Every way this can fail is a state the caller can draw. A mic that does
/// nothing, forever, is the failure mode this control actually has — the same
/// reasoning `Speaker.message` above is written from.
@Observable
@MainActor
public final class Dictation {
    /// Why the last tap did nothing. Drawn beside the mic.
    public enum Trouble: Sendable {
        case unavailable, denied, engine, recognition

        var sentence: String {
            switch self {
            case .unavailable: String(localized: "Ditado indisponível neste idioma ou sem conexão.")
            case .denied: String(localized: "Sem permissão para o microfone. Autorize em Ajustes para ditar.")
            case .engine: String(localized: "Não conseguimos abrir o microfone agora. Tente de novo.")
            case .recognition: String(localized: "O ditado parou sozinho. O que já foi ouvido está no campo.")
            }
        }
    }

    public private(set) var listening = false
    public private(set) var trouble: Trouble?
    /// Between the tap and the permission reply there is no engine to stop and
    /// nothing on screen yet — but a second tap must not start a second one:
    /// two `installTap`s on the same bus is an ObjC exception, not an error.
    private var starting = false
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var transcript = ""
    /// Where the transcription goes. Held for the whole run so the recogniser
    /// stopping on its own can still deliver what it heard.
    private var onText: ((String) -> Void)?

    public init() {}

    public func toggle(onText: @escaping (String) -> Void) {
        if listening { return flush() }
        // The tap that lands while the permission sheet is still up: cancel the
        // start rather than queue a second one.
        if starting { starting = false; return }
        start(onText)
    }

    /// Deliver whatever has been heard and hand the session back. What the
    /// learner said out loud survives leaving the screen or hitting send —
    /// delivery only ever happened on an explicit second tap before.
    public func flush() {
        guard listening else { return starting = false }
        end(deliver: true)
    }

    private func start(_ onText: @escaping (String) -> Void) {
        trouble = nil
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: AtlasAPI.language)),
              recognizer.isAvailable else { return trouble = .unavailable }
        starting = true
        self.onText = onText
        // Not Sendable, only ever read on the main actor — the crossing is
        // stated rather than hidden, same as the buffer request below.
        nonisolated(unsafe) let ready = recognizer
        Task { @MainActor in
            // Two separate TCC permissions, and the microphone one has to be
            // answered *before* `inputNode` is touched: on a denied mic the
            // node reports a 0 Hz format and `installTap` raises an ObjC
            // exception, which Swift cannot catch — the app just dies.
            guard await AVAudioApplication.requestRecordPermission() else { return self.giveUp(.denied) }
            guard await Self.speechAllowed() else { return self.giveUp(.denied) }
            guard self.starting else { return }
            self.listen(ready)
        }
    }

    private static func speechAllowed() async -> Bool {
        await withCheckedContinuation { resume in
            // The TCC reply lands on a background queue, so the closure must
            // carry no main-actor isolation of its own or Swift 6 traps on
            // entry, before the hop above can happen.
            SFSpeechRecognizer.requestAuthorization { @Sendable status in
                resume.resume(returning: status == .authorized)
            }
        }
    }

    private func giveUp(_ trouble: Trouble) {
        starting = false
        onText = nil
        self.trouble = trouble
    }

    private func listen(_ recognizer: SFSpeechRecognizer) {
        transcript = ""
        // The buffer request is handed to an audio-thread tap and to the
        // recognizer's own queue; neither is Sendable and both are the API's
        // documented use, so the crossing is stated rather than hidden.
        nonisolated(unsafe) let request = SFSpeechAudioBufferRecognitionRequest()
        // Partial results, but nothing is delivered until the learner stops:
        // the running transcript is what `end` has to read, since the final
        // result lands after the task is finished.
        request.shouldReportPartialResults = true
        try? AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // The backstop for the exception above: a format with no rate and no
        // channels is what a mic the app cannot use reports.
        guard format.sampleRate > 0, format.channelCount > 0 else { return giveUp(.denied) }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        guard (try? engine.start()) != nil else {
            input.removeTap(onBus: 0)
            return giveUp(.engine)
        }
        starting = false
        listening = true
        task = recognizer.recognitionTask(with: request) { @Sendable result, error in
            // Only the string and two flags cross back — the result object
            // stays on the recognizer's queue.
            let text = result?.bestTranscription.formattedString
            let (failed, final) = (error != nil, result?.isFinal ?? false)
            Task { @MainActor in
                if let text { self.transcript = text }
                // The recogniser ends on its own on a network drop and at
                // Apple's ~one-minute cap on a single utterance. Nothing would
                // fire again: the mic would keep breathing over an engine
                // nobody is reading, and the learner would find out by tapping.
                if failed || final { self.ended(failed: failed) }
            }
        }
    }

    private func ended(failed: Bool) {
        guard listening else { return }
        end(deliver: true)
        if failed { trouble = .recognition }
    }

    private func end(deliver: Bool) {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        task?.finish()
        task = nil
        listening = false
        starting = false
        // Give the shared session back, or read-aloud on the next screen plays
        // into a session still configured to record.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let said = transcript.trimmed
        transcript = ""
        let deliverTo = onText
        onText = nil
        if deliver, !said.isEmpty { deliverTo?(said) }
    }
}
