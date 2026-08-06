"use client";

// The one voice seam. Every browser speech detail lives here — no surface
// touches `window.speechSynthesis` or `SpeechRecognition` directly, so a
// server engine could replace the internals without touching a component.
//
// Engine is browser-native Web Speech: no dependency, no key, no per-minute
// cost, and the only option that gives the live as-you-talk transcript
// §SPEC's Feynman pass asks for. Chrome/Edge/Safari have it; Firefox has no
// `SpeechRecognition` and every voice control simply doesn't render.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsumeChunk } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

// ---- pure helpers ---------------------------------------------------------

/** BCP-47 tag for the engine. The voice follows the language setting; it is
 *  never a second choice the learner has to make. */
export function speechLang(language: Language): string {
  return language === "en" ? "en-US" : "pt-BR";
}

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
export const DEFAULT_VOICE_PREFS: VoicePrefs = { dictation: true, readAloud: true };

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
      typeof rec.dictation === "boolean"
        ? rec.dictation
        : DEFAULT_VOICE_PREFS.dictation,
    readAloud:
      typeof rec.readAloud === "boolean"
        ? rec.readAloud
        : DEFAULT_VOICE_PREFS.readAloud,
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

export function readAloudSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Support, resolved after mount so the server and first client render agree.
 *  Both read `false` for one frame — the controls fade in, they never flip a
 *  hydrated tree. */
export function useVoiceSupport(): { dictation: boolean; readAloud: boolean } {
  const [support, setSupport] = useState({ dictation: false, readAloud: false });
  useEffect(() => {
    setSupport({ dictation: dictationSupported(), readAloud: readAloudSupported() });
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
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = speechLang(langRef.current);
    rec.continuous = true;
    rec.interimResults = true;
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
  }, [stop]);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  // Recognition holds the mic open; it must not outlive the surface.
  useEffect(() => stop, [stop]);

  return { supported, listening, interim, error, toggle, stop };
}

// ---- read-aloud -----------------------------------------------------------

export interface ReadAloud {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  /** Index of the segment being spoken, or -1 when silent. */
  index: number;
  speak: (segments: string[]) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export function useReadAloud({ language }: { language: Language }): ReadAloud {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(-1);

  const segmentsRef = useRef<string[]>([]);
  const langRef = useRef(language);
  // A cancelled utterance still fires `onend` a tick later; the token tells a
  // stale callback from the live run so a restart can't double up.
  const runRef = useRef(0);

  useEffect(() => {
    langRef.current = language;
  });

  useEffect(() => {
    setSupported(readAloudSupported());
  }, []);

  const silence = useCallback(() => {
    setSpeaking(false);
    setPaused(false);
    setIndex(-1);
  }, []);

  // Speaks segment `i` of run `run`, then chains to the next through the ref
  // so the utterance callback always reaches the live step.
  const stepRef = useRef<(i: number, run: number) => void>(() => {});
  const step = useCallback(
    (i: number, run: number) => {
      if (run !== runRef.current) return;
      const segments = segmentsRef.current;
      if (i >= segments.length) {
        silence();
        return;
      }
      setIndex(i);
      // One utterance per segment, not one giant one: it lets the caller
      // highlight what's being read, and sidesteps Chrome's long-text cutoff.
      const utterance = new SpeechSynthesisUtterance(segments[i]);
      utterance.lang = speechLang(langRef.current);
      utterance.onend = () => stepRef.current(i + 1, run);
      utterance.onerror = () => {
        if (run !== runRef.current) return;
        runRef.current++;
        silence();
      };
      window.speechSynthesis.speak(utterance);
    },
    [silence],
  );
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const cancel = useCallback(() => {
    runRef.current++;
    segmentsRef.current = [];
    if (readAloudSupported()) window.speechSynthesis.cancel();
    silence();
  }, [silence]);

  const speak = useCallback(
    (segments: string[]) => {
      if (!readAloudSupported()) return;
      const clean = segments.map((s) => s.trim()).filter(Boolean);
      // Starting one reading cancels any other — one section speaks at a time.
      runRef.current++;
      window.speechSynthesis.cancel();
      if (!clean.length) {
        silence();
        return;
      }
      segmentsRef.current = clean;
      setSpeaking(true);
      setPaused(false);
      step(0, runRef.current);
    },
    [silence, step],
  );

  const pause = useCallback(() => {
    if (!readAloudSupported()) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!readAloudSupported()) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  // `speechSynthesis` outlives React — without this it keeps talking after the
  // learner has left the screen.
  useEffect(
    () => () => {
      runRef.current++;
      if (readAloudSupported()) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, speaking, paused, index, speak, pause, resume, cancel };
}
