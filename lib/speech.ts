"use client";

// The one voice seam. No surface touches a speech API directly — the hooks
// here are the whole vocabulary — and the two halves now run on two engines,
// because they are two different problems.
//
// Dictation stays on browser-native `SpeechRecognition`: no dependency, no
// key, no per-minute cost, and the only option that gives the live
// as-you-talk transcript §SPEC's Feynman pass asks for. Chrome/Edge/Safari
// have it; Firefox does not, and every mic control simply doesn't render.
//
// Read-aloud moved off `speechSynthesis` to a hosted engine behind
// `/api/speech`. The browser's own voices were free but unaccountable — a
// different, usually worse voice per OS, nothing at all in some browsers, and
// no timing information, so the most a reader could be shown was which
// *paragraph* was being read. The hosted engine returns per-word timestamps,
// which is what the read-along highlight and the honest progress ring are
// built on. There is deliberately no fallback to `speechSynthesis`: one
// engine, or none.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpeech, type SpeechClip, type SpeechMark } from "@/lib/api";
import type { ConsumeChunk } from "@/lib/curriculum";
import { toAtlasError, type ErrorCode } from "@/lib/errors";
import type { Language } from "@/lib/i18n";
import { speechLang } from "@/lib/locale";
import { spokenText, type SpeakRange } from "@/lib/rich";

// ---- pure helpers ---------------------------------------------------------

// The locale tag lives in `lib/locale.ts` so the server's speech route can name
// the same voice this file's dictation does. Re-exported because every caller
// here has always reached it through `lib/speech`.
export { speechLang };

/** An adaptive-modality rewrite as paragraphs. The model writes them as one
 *  string with blank-line breaks (the view renders it `pre-line`), and both the
 *  voice and the paragraph highlight need the same split to stay in step. */
export function altParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * What of a Consume section reads aloud, in reading order: the prose, then the
 * worked example (title, then steps), then the takeaway. The figure is a
 * diagram and the citation is a reference — neither speaks sensibly.
 *
 * `altText` is the rewrite currently *on screen* in place of the prose. It has
 * to be passed in rather than assumed away: reading `c.body` while the learner
 * is looking at the "simpler" version means the voice and the page are telling
 * two different stories, and the paragraph highlight lands on elements that
 * aren't rendered.
 */
export function segmentsForChunk(c: ConsumeChunk, altText?: string | null): string[] {
  const prose = altText ? altParagraphs(altText) : c.body;
  return [prose, [c.example.title, ...c.example.steps], [c.takeaway]]
    .flat()
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Finalized speech is appended to what's already in the box — typing and
 *  speaking mix freely, and dictation never replaces what's there. */
export function appendTranscript(existing: string, addition: string): string {
  const piece = addition.trim();
  if (!piece) return existing;
  if (!existing) return piece;
  return /\s$/.test(existing) ? existing + piece : `${existing} ${piece}`;
}

// ---- preferences ----------------------------------------------------------

export const VOICE_STORAGE_KEY = "atlas.voice";

export interface VoicePrefs {
  dictation: boolean;
  readAloud: boolean;
}

/** Both halves are on wherever the browser can do them. */
export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  dictation: true,
  readAloud: true,
};

/** Tolerates a missing, malformed, or half-written value — a corrupt entry
 *  falls back to the defaults rather than taking voice away. */
export function parseVoicePrefs(raw: string | null): VoicePrefs {
  if (!raw) return DEFAULT_VOICE_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_VOICE_PREFS;
  const rec = parsed as Record<string, unknown>;
  return {
    dictation:
      typeof rec.dictation === "boolean" ? rec.dictation : DEFAULT_VOICE_PREFS.dictation,
    readAloud:
      typeof rec.readAloud === "boolean" ? rec.readAloud : DEFAULT_VOICE_PREFS.readAloud,
  };
}

// One device-level store shared by every hook instance, so flipping a toggle
// in Settings reaches a mic mounted on another surface.
let storedPrefs: VoicePrefs = DEFAULT_VOICE_PREFS;
let prefsLoaded = false;
const prefsListeners = new Set<(p: VoicePrefs) => void>();

/** Device-level voice preferences. Mirrors `detectLanguage()` in `lib/i18n`:
 *  mount with the defaults, read `localStorage` in an effect, so the server
 *  render and the first client render agree. */
export function useVoicePrefs(): VoicePrefs & {
  setDictation: (on: boolean) => void;
  setReadAloud: (on: boolean) => void;
} {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);

  useEffect(() => {
    if (!prefsLoaded) {
      prefsLoaded = true;
      storedPrefs = parseVoicePrefs(window.localStorage.getItem(VOICE_STORAGE_KEY));
    }
    setPrefs(storedPrefs);
    prefsListeners.add(setPrefs);
    return () => {
      prefsListeners.delete(setPrefs);
    };
  }, []);

  const patch = useCallback((next: Partial<VoicePrefs>) => {
    storedPrefs = { ...storedPrefs, ...next };
    window.localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(storedPrefs));
    for (const listen of prefsListeners) listen(storedPrefs);
  }, []);

  return {
    ...prefs,
    setDictation: useCallback((on: boolean) => patch({ dictation: on }), [patch]),
    setReadAloud: useCallback((on: boolean) => patch({ readAloud: on }), [patch]),
  };
}

// ---- browser capability ---------------------------------------------------

// TypeScript's bundled `lib.dom.d.ts` doesn't declare `SpeechRecognition` at
// the TS version this repo pins, and the repo carries no incidental deps —
// so the shape it actually uses is declared structurally right here.
interface RecognitionAlternative {
  readonly transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}
interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Support, resolved after mount so the server and first client render agree.
 *  Both read `false` for one frame — the controls fade in, they never flip a
 *  hydrated tree. Dictation asks the browser; read-aloud asks the deploy
 *  (`readAloudSupported`, defined with the engine below).*/
export function useVoiceSupport(): { dictation: boolean; readAloud: boolean } {
  const [support, setSupport] = useState({
    dictation: false,
    readAloud: false,
  });
  useEffect(() => {
    setSupport({
      dictation: dictationSupported(),
      readAloud: readAloudSupported(),
    });
  }, []);
  return support;
}

// ---- dictation ------------------------------------------------------------

/** Error codes, not copy: the strings live co-located with the surface that
 *  shows them, per the dictionary rule in `lib/i18n`. */
export type DictationError = "permission" | "no-speech" | "no-mic" | "unknown";

function dictationError(code: string): DictationError {
  if (code === "not-allowed" || code === "service-not-allowed") return "permission";
  if (code === "no-speech") return "no-speech";
  if (code === "audio-capture") return "no-mic";
  return "unknown";
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** Started, but the engine isn't on the mic yet — the permission prompt
   *  alone can sit here for seconds. */
  starting: boolean;
  /** The not-yet-final words, for the live preview. */
  interim: string;
  error: DictationError | null;
  toggle: () => void;
  stop: () => void;
}

export function useDictation({
  language,
  onFinal,
}: {
  language: Language;
  /** Called with each finalized segment — the caller appends it. */
  onFinal: (text: string) => void;
}): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<DictationError | null>(null);

  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  const langRef = useRef(language);

  useEffect(() => {
    onFinalRef.current = onFinal;
    langRef.current = language;
  });

  useEffect(() => {
    setSupported(dictationSupported());
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      // Detach first: a deliberate stop shouldn't surface as an "aborted".
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Already stopped — nothing to unwind.
      }
    }
    setListening(false);
    setStarting(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = speechLang(langRef.current);
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setStarting(false);
    rec.onresult = (e) => {
      let final = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else live += text;
      }
      setInterim(live);
      if (final.trim()) onFinalRef.current(final);
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(dictationError(e.error));
      stop();
    };
    // Engines end the session on their own after a stretch of silence.
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setStarting(false);
      setInterim("");
    };
    setError(null);
    try {
      rec.start();
    } catch {
      return;
    }
    recRef.current = rec;
    setListening(true);
    setStarting(true);
  }, [stop]);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  // Recognition holds the mic open; it must not outlive the surface.
  useEffect(() => stop, [stop]);

  return { supported, listening, starting, interim, error, toggle, stop };
}

// ---- read-aloud -----------------------------------------------------------

/**
 * Where the voice is, as a state and not as three booleans.
 *
 * The old `speechSynthesis` engine could only distinguish "warming up" from
 * "talking", and it signalled the difference by pulsing the whole control's
 * opacity. A hosted engine has real, separable waits: fetching the first clip
 * of a section is not the same event as running dry between two paragraphs,
 * and neither is the same as failing. Each one gets a name, so the control can
 * tell the truth about which it is in.
 */
export type ReadStatus =
  /** Nothing is being read. */
  | "idle"
  /** Asked to speak; the first clip is still on the wire. */
  | "preparing"
  | "playing"
  /** Mid-reading, and the next segment hasn't landed yet. */
  | "buffering"
  | "paused"
  /** The engine, the network, or the key failed. Clicking again retries. */
  | "error";

export interface ReadAloud {
  supported: boolean;
  status: ReadStatus;
  /** Why it failed, for the sentence in `lib/errorCopy.ts`. */
  error: ErrorCode | null;
  /** Index of the segment being read, or -1 when silent. */
  index: number;
  /** The word being spoken, as a range in `spokenText()` of that segment —
   *  which is exactly the range `<Rich speak={…}>` marks. Null when the engine
   *  returned no word timing. */
  word: SpeakRange | null;
  /** How far through the whole reading, 0–1. */
  progress: number;
  speak: (segments: string[]) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/**
 * Is read-aloud available at all?
 *
 * No longer a browser question. The engine is a server route, so what decides
 * this is whether the deploy has a provider key — mirrored into the bundle as
 * a bare boolean by `next.config.ts`, never the key itself. Unset, and the
 * speaker control simply never renders: there is no `speechSynthesis` fallback
 * to drop back to, by design, so voice quality never depends on which browser
 * the learner happens to be in.
 */
export function readAloudSupported(): boolean {
  return process.env.NEXT_PUBLIC_TTS_ENABLED === "1";
}

/**
 * The word being spoken at `ms`, or null.
 *
 * Binary search rather than a scan: this runs once per animation frame for the
 * length of a paragraph. Marks are sorted and non-overlapping, and a time that
 * lands in the gap *between* two words — the pause after a comma — returns
 * null rather than the neighbour, so the highlight goes out during a pause
 * instead of clinging to a word the voice has already left.
 */
export function wordAt(marks: SpeechMark[], ms: number): SpeechMark | null {
  let lo = 0;
  let hi = marks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const mark = marks[mid];
    if (ms < mark.at) hi = mid - 1;
    else if (ms >= mark.end) lo = mid + 1;
    else return mark;
  }
  return null;
}

/**
 * How far into a reading we are, weighted by characters rather than by segment
 * count.
 *
 * A section's segments are wildly uneven — a two-word example title sits
 * between two long paragraphs — so "segment 3 of 6" would show a progress ring
 * that lurches. Character count is a good proxy for duration and, unlike
 * duration, it is known before any audio has been fetched, so the ring is
 * honest from the first frame.
 */
export function readProgress(lengths: number[], index: number, fraction: number): number {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total || index < 0) return 0;
  let before = 0;
  for (let i = 0; i < index && i < lengths.length; i++) before += lengths[i];
  const current = (lengths[index] ?? 0) * Math.min(Math.max(fraction, 0), 1);
  return Math.min((before + current) / total, 1);
}

// One clip cache for the whole device, not one per hook: a learner who reads a
// section, moves on, and comes back pays for it once. `clips` holds what has
// resolved and `pending` what is still on the wire — the split matters because
// a segment whose audio is already in hand must not flash "buffering" for the
// frame it takes a resolved promise to settle.
const clips = new Map<string, SpeechClip>();
const pending = new Map<string, Promise<SpeechClip>>();
/** Bounded, oldest-out. A section is a handful of segments; this is a few
 *  sections' worth of mp3 and nothing like a memory concern. */
const CLIP_LIMIT = 40;

function clipKey(text: string, language: Language): string {
  return `${language}\u0000${text}`;
}

function remember(key: string, clip: SpeechClip): void {
  clips.set(key, clip);
  while (clips.size > CLIP_LIMIT) {
    const oldest = clips.keys().next().value;
    if (oldest === undefined) break;
    clips.delete(oldest);
  }
}

/** The clip for one segment: from memory, from a request already in flight, or
 *  from a new one. Never two requests for the same words. */
function clipFor(text: string, language: Language): Promise<SpeechClip> {
  const key = clipKey(text, language);
  const held = clips.get(key);
  if (held) return Promise.resolve(held);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = fetchSpeech({ text, language })
    .then((clip) => {
      remember(key, clip);
      return clip;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/** Already in hand, synchronously — the test that keeps a prefetched segment
 *  from rendering a buffering state it doesn't need. */
function heldClip(text: string, language: Language): SpeechClip | undefined {
  return clips.get(clipKey(text, language));
}

function blobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}

/**
 * Read a list of segments aloud, marking the word being spoken.
 *
 * Segments arrive as the markdown the page renders; what goes to the engine is
 * `spokenText()` of each — the same strip `Rich` renders through — so the
 * character offsets that come back index straight into what is on screen.
 */
export function useReadAloud({ language }: { language: Language }): ReadAloud {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<ReadStatus>("idle");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [index, setIndex] = useState(-1);
  const [word, setWord] = useState<SpeakRange | null>(null);
  const [progress, setProgress] = useState(0);

  // One element for the life of the hook. Not one per segment: iOS only lets
  // an element play if a user gesture unlocked *that element*, so a fresh
  // `new Audio()` per paragraph would speak the first one and go silent for
  // the rest of the section.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const spokenRef = useRef<string[]>([]);
  const lengthsRef = useRef<number[]>([]);
  const marksRef = useRef<SpeechMark[]>([]);
  const indexRef = useRef(-1);
  const wordRef = useRef<SpeakRange | null>(null);
  const progressRef = useRef(0);
  const langRef = useRef(language);
  // A cancelled reading can still have a fetch and an `onended` in flight; the
  // token tells a stale callback from the live run, exactly as it did when the
  // engine was `speechSynthesis`.
  const runRef = useRef(0);

  useEffect(() => {
    langRef.current = language;
  });

  useEffect(() => {
    setSupported(readAloudSupported());
  }, []);

  const stopClock = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const silence = useCallback(() => {
    stopClock();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    releaseUrl();
    spokenRef.current = [];
    lengthsRef.current = [];
    marksRef.current = [];
    indexRef.current = -1;
    wordRef.current = null;
    progressRef.current = 0;
    setIndex(-1);
    setWord(null);
    setProgress(0);
  }, [releaseUrl, stopClock]);

  // The word clock. Reading `currentTime` per frame tracks the voice more
  // steadily than any engine's own boundary events, and it costs a render only
  // when the word actually changes — at three to five words a second, not at
  // sixty frames.
  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const ms = audio.currentTime * 1000;
    const mark = wordAt(marksRef.current, ms);
    const next = mark ? { from: mark.from, to: mark.to } : null;
    const held = wordRef.current;
    if (next?.from !== held?.from || next?.to !== held?.to) {
      wordRef.current = next;
      setWord(next);
    }
    const fraction =
      audio.duration && Number.isFinite(audio.duration)
        ? audio.currentTime / audio.duration
        : 0;
    const now = readProgress(lengthsRef.current, indexRef.current, fraction);
    // A 26px ring can't show finer than a hundredth, and a setState per frame
    // would re-render the whole pass sixty times a second.
    if (Math.abs(now - progressRef.current) >= 0.01) {
      progressRef.current = now;
      setProgress(now);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopClock, tick]);

  const fail = useCallback(
    (err: unknown) => {
      stopClock();
      setError(toAtlasError(err).code);
      setStatus("error");
      setWord(null);
    },
    [stopClock],
  );

  // Plays segment `i` of run `run`, then chains to the next from `onended`.
  const playRef = useRef<(i: number, run: number) => void>(() => {});
  const play = useCallback(
    async (i: number, run: number) => {
      if (run !== runRef.current) return;
      const segments = spokenRef.current;
      if (i >= segments.length) {
        setStatus("idle");
        silence();
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      const lang = langRef.current;
      indexRef.current = i;
      setIndex(i);

      // Only announce a wait there is one. A prefetched segment goes straight
      // from playing to playing, with no buffering frame in between.
      let clip = heldClip(segments[i], lang);
      if (!clip) {
        setStatus(i === 0 ? "preparing" : "buffering");
        setWord(null);
        wordRef.current = null;
        try {
          clip = await clipFor(segments[i], lang);
        } catch (err) {
          if (run !== runRef.current) return;
          fail(err);
          return;
        }
        if (run !== runRef.current) return;
      }

      marksRef.current = clip.marks;
      releaseUrl();
      urlRef.current = blobUrl(clip.audio);
      // Bound per segment, closing over *this* run and index. Bound once in
      // `speak` instead, a late `ended` from a cancelled reading would advance
      // whatever run had started since — reading a section from its second
      // paragraph, with nothing to show why.
      audio.onended = () => {
        if (run === runRef.current) playRef.current(i + 1, run);
      };
      audio.onerror = () => {
        if (run === runRef.current && audio.src) fail(new Error("playback failed"));
      };
      audio.src = urlRef.current;
      try {
        await audio.play();
      } catch (err) {
        if (run !== runRef.current) return;
        fail(err);
        return;
      }
      if (run !== runRef.current) return;
      setStatus("playing");
      setError(null);
      startClock();

      // Fetch the next segment while this one plays, so the seam between two
      // paragraphs is silence the length of a breath rather than a round-trip.
      const next = segments[i + 1];
      if (next) void clipFor(next, lang).catch(() => {});
    },
    [fail, releaseUrl, silence, startClock],
  );
  useEffect(() => {
    playRef.current = (i, run) => void play(i, run);
  }, [play]);

  const cancel = useCallback(() => {
    runRef.current++;
    setStatus("idle");
    setError(null);
    silence();
  }, [silence]);

  const speak = useCallback(
    (segments: string[]) => {
      if (!readAloudSupported()) return;
      const spoken = segments.map((s) => spokenText(s).trim()).filter(Boolean);
      // Starting one reading cancels any other — one section speaks at a time.
      runRef.current++;
      const run = runRef.current;
      stopClock();

      if (!audioRef.current) {
        const audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;
      }
      // `load()` inside the click is what unlocks the element on iOS. The first
      // `play()` happens after an await, which no longer counts as gesture-
      // initiated there, so the unlock has to happen here or not at all.
      audioRef.current.pause();
      audioRef.current.load();

      if (!spoken.length) {
        setStatus("idle");
        silence();
        return;
      }
      spokenRef.current = spoken;
      lengthsRef.current = spoken.map((s) => s.length);
      indexRef.current = 0;
      wordRef.current = null;
      progressRef.current = 0;
      setWord(null);
      setProgress(0);
      setError(null);
      setStatus("preparing");
      void play(0, run);
    },
    [play, silence, stopClock],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Exact, unlike `speechSynthesis.pause()`, which several engines ignored
    // mid-utterance and left the control claiming a pause that never happened.
    audio.pause();
    stopClock();
    setStatus("paused");
  }, [stopClock]);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(
      () => {
        setStatus("playing");
        startClock();
      },
      (err: unknown) => fail(err),
    );
  }, [fail, startClock]);

  // The element outlives React — without this it keeps talking after the
  // learner has left the screen, the way `speechSynthesis` used to.
  useEffect(
    () => () => {
      runRef.current++;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return {
    supported,
    status,
    error,
    index,
    word,
    progress,
    speak,
    pause,
    resume,
    cancel,
  };
}
