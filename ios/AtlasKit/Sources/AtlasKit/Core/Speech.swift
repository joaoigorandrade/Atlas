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

    /// Drop the failure notice. A section turn is not a retry, but the banner
    /// is about the section being left — see `ConsumeViewModel.advance`.
    public func clearMessage() { message = "" }

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
    /// What the recogniser has heard so far, live. The delivery contract is
    /// unchanged — the field only gets the words on stop — but a composer whose
    /// primary control is a mic has to show them landing, or the learner is
    /// talking at a button with no way to tell whether it is listening.
    public private(set) var heard = ""
    /// How loud the mic is hearing them right now, 0…1. Published for the one
    /// surface that draws it: a waveform animated by a timer looks identical
    /// whether the mic is open or dead, which is the failure this control
    /// actually has.
    public private(set) var level: Double = 0
    public private(set) var trouble: Trouble?
    /// Between the tap and the permission reply there is no engine to stop and
    /// nothing on screen yet — but a second tap must not start a second one:
    /// two `installTap`s on the same bus is an ObjC exception, not an error.
    private var starting = false
    /// Built for each run and thrown away with it. A single long-lived engine
    /// caches the hardware format it first saw, and read-aloud — which this
    /// phase has beside the mic — moves the session off `.record` and back
    /// under it. `installTap` on a stale format is an ObjC exception, not an
    /// error: the app dies where a Swift `throw` would have been drawn.
    private var engine: AVAudioEngine?
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

    /// One buffer's RMS on a 0…1 scale. Speech sits around -40…-10 dBFS, so the
    /// raw amplitude would leave the bars flat: the curve is what makes an
    /// ordinary voice fill them.
    private nonisolated static func loudness(_ buffer: AVAudioPCMBuffer) -> Double {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
        let decibels = 20 * log10(max((sum / Float(buffer.frameLength)).squareRoot(), 1e-7))
        return min(max(Double(decibels + 50) / 50, 0), 1)
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
        heard = ""
        // The buffer request is handed to an audio-thread tap and to the
        // recognizer's own queue; neither is Sendable and both are the API's
        // documented use, so the crossing is stated rather than hidden.
        nonisolated(unsafe) let request = SFSpeechAudioBufferRecognitionRequest()
        // Partial results, but nothing is delivered until the learner stops:
        // the running transcript is what `end` has to read, since the final
        // result lands after the task is finished.
        request.shouldReportPartialResults = true
        // Recording is a session the app has to be *given*, and it is refused
        // often enough to matter — a call, another app holding the mic, a
        // read-aloud clip still playing out of this very screen. Refused, the
        // session stays on whatever category it had, and every line below
        // reads a microphone that isn't there. The failure was swallowed by
        // `try?` before, so the screen kept going into the crash.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return giveUp(.engine)
        }
        // Only now, with the session actually on `.record`: the input node is
        // born holding whatever the hardware was doing when it was first
        // asked, and one born under `.playback` reports a mic that cannot be
        // tapped.
        let engine = AVAudioEngine()
        self.engine = engine
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // The backstop for the exception above: a format with no rate and no
        // channels is what a mic the app cannot use reports. Both sides of the
        // node are checked — `installTap` asserts on the *hardware* format,
        // which can be the invalid one while the output side still looks sane.
        let hardware = input.inputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              hardware.sampleRate > 0, hardware.channelCount > 0 else { return giveUp(.denied) }
        // `@Sendable` is the whole fix, not a formality. `AVAudioNodeTapBlock`
        // carries no annotation of its own, so a closure written here inherits
        // this class's `@MainActor` — and an isolated closure is compiled with
        // a `dispatch_assert_queue(main)` preamble. The tap runs on the audio
        // render thread, which trips that assertion the instant the first
        // buffer arrives: "BUG IN CLIENT OF LIBDISPATCH: Block was not
        // expected to execute on queue", a trap rather than an error. Marked
        // `@Sendable`, the closure is `nonisolated` and the check is gone —
        // which is correct, since it only touches the request.
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { @Sendable buffer, _ in
            request.append(buffer)
            // One `Double` crosses back, roughly forty times a second — the
            // buffer itself never leaves the render thread.
            let loudness = Self.loudness(buffer)
            Task { @MainActor in self.level = loudness }
        }
        engine.prepare()
        guard (try? engine.start()) != nil else {
            input.removeTap(onBus: 0)
            self.engine = nil
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
                if let text { self.transcript = text; self.heard = text }
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
        if let engine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
            self.engine = nil
        }
        task?.finish()
        task = nil
        listening = false
        starting = false
        level = 0
        // Give the shared session back, or read-aloud on the next screen plays
        // into a session still configured to record.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let said = transcript.trimmed
        transcript = ""
        // Cleared with the run, or the live line and the delivered answer draw
        // the same sentence twice.
        heard = ""
        let deliverTo = onText
        onText = nil
        if deliver, !said.isEmpty { deliverTo?(said) }
    }
}
