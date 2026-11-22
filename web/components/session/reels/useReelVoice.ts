"use client";

// Read-aloud in the reels, a card at a time. Swiping away stops the voice, as
// it does on a reel. Auto-play reads each card as it arrives and moves on when
// the reading ends on its own; it stops at a card with nothing to read — a
// question waits for the learner, never for the voice.
//
// The engine reports a natural end and a cancel the same way (`idle`), so the
// hook keeps its own record of what it stopped: only an end it did not cause
// moves the feed on.

import { useCallback, useEffect, useRef, useState } from "react";
import { reelSpoken, type ReelCard } from "@/lib/curriculum";
import { useReadAloud, useVoicePrefs } from "@/lib/speech";
import type { Language } from "@/lib/i18n";

export function useReelVoice({
  language,
  current,
  onEnded,
}: {
  language: Language;
  /** The card on screen. */
  current: ReelCard | undefined;
  /** A reading of the card on screen ended on its own, with auto-play on. */
  onEnded: () => void;
}) {
  const { readAloud: readPref } = useVoicePrefs();
  const reading = useReadAloud({ language });
  const { speak, pause, resume, cancel, status } = reading;
  const on = reading.supported && readPref;
  const [card, setCard] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const stopped = useRef(false);
  const cardRef = useRef(card);
  cardRef.current = card;
  const currentKey = useRef(current?.key);
  currentKey.current = current?.key;

  const speakCard = useCallback(
    (c: ReelCard) => {
      const segments = reelSpoken(c);
      if (!segments) return;
      stopped.current = false;
      setCard(c.key);
      speak(segments);
    },
    [speak],
  );
  const stop = useCallback(() => {
    stopped.current = true;
    cancel();
    setCard(null);
  }, [cancel]);
  const listen = (c: ReelCard) => {
    const live = card === c.key && status !== "idle" && status !== "error";
    if (!live) speakCard(c);
    else if (status === "paused") resume();
    else pause();
  };

  useEffect(() => {
    if (!on || !current) return;
    if (autoplay && reelSpoken(current)) {
      if (cardRef.current !== current.key) speakCard(current);
    } else if (cardRef.current && cardRef.current !== current.key) stop();
  }, [current, autoplay, on, speakCard, stop]);

  const lastStatus = useRef(status);
  useEffect(() => {
    const was = lastStatus.current;
    lastStatus.current = status;
    if (status !== "idle" || was === "idle" || was === "error" || stopped.current) return;
    const finished = cardRef.current;
    setCard(null);
    if (autoplay && finished && finished === currentKey.current) onEnded();
  }, [status, autoplay, onEnded]);

  return {
    on,
    card,
    status,
    index: reading.index,
    word: reading.word,
    autoplay,
    setAutoplay,
    listen,
    stop,
  };
}
