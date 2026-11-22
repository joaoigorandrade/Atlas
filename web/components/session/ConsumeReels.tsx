"use client";

// Consume as reels: the reading as a vertical feed of full-screen cards, one
// idea each, swiped through (docs/RESEARCH-PHASES.md §8). The deck is
// `consumeReel` — a view of the same `ConsumeProgress` the page view drives,
// through the same callbacks, so every gate, the pretest, the recap and the
// saved progress are exactly what they were. What changes is the unit: a
// screen, not a section; a swipe, not a scroll.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  altControls,
  consumeReel,
  phaseLabel,
  reelSections,
  reelSpoken,
  type AltKey,
  type ConsumeChunk,
  type ReelCard,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";
import Button from "@/components/ui/Button";
import HoverHint from "@/components/HoverHint";
import { BLUE, STRINGS } from "./consume/shared";
import { ModelView } from "./consume/ModelView";
import ConsumeRecap, { passWords } from "./ConsumeRecap";
import type { ConsumeViewProps } from "./ConsumeView";
import { ReelCardView, type ReelCtx } from "./reels/ReelCardView";
import { ReelAskSheet, ReelNotice, ReelStoryBar } from "./reels/ReelChrome";
import { useReelVoice } from "./reels/useReelVoice";

export default function ConsumeReels(props: ConsumeViewProps) {
  const { title, plan, chunks, session, streaming = false, onExit, onSwitchView } = props;
  const t = useT(STRINGS);
  const { language } = useLanguage();

  // A section whose prose was on screen before its check landed is never
  // pretested — the check arriving would pull the card out from under them.
  const readBare = useRef(new Set<string>());
  for (const c of chunks.slice(0, session.idx + 1))
    if (!c.check) readBare.current.add(c.id);
  const deck = useMemo(
    () => consumeReel(chunks, session, { streaming, readBare: readBare.current }),
    [chunks, session, streaming],
  );
  const sections = useMemo(() => reelSections(deck), [deck]);

  // Leaning on "simpler" three times flags a missing prerequisite, as on the page.
  const simpleFlag =
    chunks.filter((c) => session.variant[c.id] === "simpler").length >= 3 &&
    session.preferred !== "simpler";
  const notices = [props.incomplete && "incomplete", simpleFlag && "prereq"].filter(
    (n): n is string => !!n,
  );
  const total = deck.length + notices.length;

  // ---- which card is on screen -----------------------------------------
  const feedRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  // The card a move is heading for, until it arrives: a second press during
  // a smooth scroll steps on from there, so three taps move three cards. A
  // swipe or a wheel of the learner's own drops it.
  const aimed = useRef<number | null>(null);
  const ownScroll = useCallback(() => {
    aimed.current = null;
  }, []);
  const deckSig = deck.map((c) => c.key).join("|") + `|${notices.join(",")}`;
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.reel);
            setActive(i);
            if (aimed.current === i) aimed.current = null;
          }
      },
      { root: feed, threshold: 0.6 },
    );
    feed.querySelectorAll("[data-reel]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [deckSig]);
  const current: ReelCard | undefined = deck[Math.min(active, deck.length - 1)];

  const goTo = useCallback((i: number, smooth = true) => {
    const el = feedRef.current?.querySelector<HTMLElement>(`[data-reel="${i}"]`);
    if (!el) return;
    aimed.current = i;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);
  const step = useCallback(
    (by: number) => goTo((aimed.current ?? activeRef.current) + by),
    [goTo],
  );
  const goNext = useCallback(() => step(1), [step]);

  // A new section opens where it starts: Continue carries the learner there.
  const shownIdx = useRef(session.idx);
  useEffect(() => {
    if (session.idx > shownIdx.current) {
      const at = sections.get(session.idx)?.start;
      if (at !== undefined) requestAnimationFrame(() => goTo(at));
    }
    shownIdx.current = session.idx;
  }, [session.idx, sections, goTo]);
  // A resumed reading opens on the section the learner left off in.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !deck.length) return;
    resumed.current = true;
    const at = sections.get(session.idx)?.start;
    if (at) goTo(at, false);
  }, [deck.length, sections, session.idx, goTo]);

  // Cards whose entrance has played (the worked example's steps land in turn).
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const currentKey = current?.key;
  useEffect(() => {
    if (currentKey) setSeen((s) => (s.has(currentKey) ? s : new Set(s).add(currentKey)));
  }, [currentKey]);

  // Arrow keys, Page keys, Space and j/k walk the feed — never while typing,
  // and never under an open lens or question, which own the keyboard then.
  // Escape closes the question sheet, as it closes a lens (`ModelView`).
  const overlayOpen = !!session.model || !!session.passage;
  const { onClosePassage } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && session.passage) {
        onClosePassage();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (overlayOpen || el?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (e.key === " " && el?.closest("button")) return;
      const down =
        ["ArrowDown", "PageDown", "j"].includes(e.key) || (e.key === " " && !e.shiftKey);
      const up =
        ["ArrowUp", "PageUp", "k"].includes(e.key) || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      e.preventDefault();
      step(down ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, step, session.passage, onClosePassage]);

  const voice = useReelVoice({ language, current, onEnded: goNext });
  const { stop } = voice;

  // ---- the open lens, held for its exit frames (as on the page) --------
  const modelChunk = session.model
    ? chunks.find((c) => c.id === session.model?.chunkId)
    : undefined;
  const lastModel = useRef<{ key: string; lens: AltKey; chunk: ConsumeChunk } | null>(
    null,
  );
  if (session.model && modelChunk)
    lastModel.current = {
      key: `${session.model.chunkId}:${session.model.lens}`,
      lens: session.model.lens,
      chunk: modelChunk,
    };
  const passageChunk = session.passage
    ? chunks.find((c) => c.id === session.passage?.chunkId)
    : undefined;

  if (session.recap)
    return (
      <ConsumeRecap
        title={title}
        plan={plan}
        chunks={chunks}
        session={session}
        onBeginNext={props.onBeginNext}
        onProve={props.onProve}
        onExit={onExit}
      />
    );

  const next = plan.find((p) => p !== "consume" && p !== "retain");
  const spokenWords = (card: ReelCard) =>
    (reelSpoken(card) ?? []).join(" ").split(/\s+/).filter(Boolean).length;
  const wordsLeft =
    deck.slice(active).reduce((sum, c) => sum + spokenWords(c), 0) +
    chunks.slice(session.idx + 1).reduce((sum, c) => sum + passWords(c), 0);
  const minutesLeft = Math.round(wordsLeft / 200);

  const ctx: ReelCtx = {
    topic: props.topic,
    title,
    chunks,
    session,
    nextLabel: next && phaseLabel(next),
    controls: altControls(language),
    voice,
    onListen: voice.listen,
    onNext: goNext,
    onPretest: props.onPretest,
    onCheck: props.onCheck,
    onContinue: props.onContinue,
    onFinish: props.onFinish,
    onToggleTerm: props.onToggleTerm,
    onToggleCollapse: props.onToggleCollapse,
    onOpenModel: props.onOpenModel,
    onOpenPassage: props.onOpenPassage,
  };

  return (
    <Sheet
      data-testid="phase-consume"
      data-layout="reels"
      aria-label={`Consume — ${title}`}
    >
      <Masthead
        back={t.back}
        onBack={() => {
          stop();
          onExit();
        }}
        kicker={t.sessionLabel}
        accent={BLUE}
        title={title}
      >
        {minutesLeft > 0 && (
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkGhost }}>
            {t.minLeft(minutesLeft)}
          </span>
        )}
        {voice.on && (
          <HoverHint hint={t.autoplayHint} place="bottom">
            <Button
              variant="quiet"
              full={false}
              data-testid="action-autoplay"
              aria-pressed={voice.autoplay}
              onClick={() => voice.setAutoplay((on) => !on)}
              style={{ padding: "5px 10px", fontSize: 13 }}
            >
              {voice.autoplay ? t.autoplayOn : t.autoplayOff}
            </Button>
          </HoverHint>
        )}
        {onSwitchView && (
          <Button
            variant="quiet"
            full={false}
            data-testid="action-view-page"
            onClick={() => {
              stop();
              onSwitchView();
            }}
            style={{ padding: "5px 10px", fontSize: 13 }}
          >
            {t.viewPage}
          </Button>
        )}
        <Button
          variant="secondary"
          full={false}
          accent={color.inkMuted}
          onClick={props.onSkipCrucible}
          style={{ padding: "5px 12px", fontSize: 13 }}
        >
          {t.iKnowThis}
        </Button>
      </Masthead>

      <ReelStoryBar
        segments={Math.max(chunks.length, 1)}
        sections={sections}
        here={current?.section ?? 0}
        active={active}
        onJump={goTo}
      />

      <div
        ref={feedRef}
        onWheel={ownScroll}
        onTouchStart={ownScroll}
        className="at-reel-feed"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}
      >
        {deck.map((card, i) => {
          const span = sections.get(card.section);
          return (
            <ReelCardView
              key={card.key}
              card={card}
              index={i}
              total={total}
              at={span ? i - span.start + 1 : 1}
              of={span?.count ?? 1}
              seen={seen.has(card.key)}
              ctx={ctx}
            />
          );
        })}
        {notices.map((kind, i) => (
          <ReelNotice
            key={kind}
            index={deck.length + i}
            incomplete={kind === "incomplete" ? props.incomplete : undefined}
            onRoutePrereq={props.onRoutePrereq}
          />
        ))}
      </div>

      {session.passage && (
        <ReelAskSheet
          ask={session.passage}
          suggestion={passageChunk?.ask ?? ""}
          onAsk={props.onAskPassage}
          onClose={props.onClosePassage}
        />
      )}

      {(modelChunk && session.model ? true : lastModel.current !== null) && (
        <ModelView
          key={
            modelChunk && session.model
              ? `${session.model.chunkId}:${session.model.lens}`
              : lastModel.current!.key
          }
          open={Boolean(modelChunk && session.model)}
          lens={session.model?.lens ?? lastModel.current!.lens}
          chunk={modelChunk ?? lastModel.current!.chunk}
          beats={props.modelBeats ?? []}
          streaming={props.modelStreaming ?? false}
          onClose={props.onCloseModel}
        />
      )}
    </Sheet>
  );
}
