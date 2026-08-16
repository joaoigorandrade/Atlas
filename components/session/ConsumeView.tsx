"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SkeletonBars } from "@/components/Pending";
import { InlineError } from "@/components/ErrorState";
import {
  PHASES,
  altControls,
  type AltKey,
  type ConsumeChunk,
  type ConsumeModelBeat,
} from "@/lib/curriculum";
import { segmentsForChunk, useReadAloud, useVoicePrefs } from "@/lib/speech";
import { color, font, kicker, motion, transition } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import type { PresenceState } from "@/lib/motion";

import Rich from "@/components/Rich";
import { BLUE, STRINGS } from "./consume/shared";
import { Figure } from "./consume/Figure";
import { SpeakerButton, sectionName } from "./consume/SpeakerButton";
import { WorkedExample } from "./consume/WorkedExample";
import { PassagePanel } from "./consume/PassagePanel";
import { SectionCheck } from "./consume/SectionCheck";
import { ModelView } from "./consume/ModelView";
export type { ConsumeSession, PassageAsk } from "./consume/shared";
import type { ConsumeSession } from "./consume/shared";

interface ConsumeViewProps {
  /** Enter/leave state for the shared `Sheet` root — AtlasApp holds this
   *  screen mounted through its exit. */
  presence: PresenceState;
  /** The node this session teaches — titles the view. */
  title: string;
  /** The generated reading pass for this node — sections already streamed
   *  in, more may still be on the way while `streaming` is true. */
  chunks: ConsumeChunk[];
  /** More sections are still being written — the deepest one currently in
   *  `chunks` isn't necessarily the pass's last section yet. */
  streaming?: boolean;
  session: ConsumeSession;
  /** Beats of the open model view, in order. Empty (or short) while they are
   *  still being written — the view opens on its first one. */
  modelBeats?: ConsumeModelBeat[];
  /** More beats are still on the way for the open view. */
  modelStreaming?: boolean;
  onExit: () => void;
  /** The end-of-section check was answered — right or wrong. */
  onCheck: (chunkId: string, oi: number, correct: boolean) => void;
  onContinue: (chunkIndex: number) => void;
  /** The last section is done — show the recap. */
  onFinish: () => void;
  /** The recap's CTA: hand off to Socratic. */
  onBeginSocratic: () => void;
  /** Open a lens over a section. The whole chunk travels up because the model
   *  view is written for this section's exact prose — the caller keys its
   *  request on it. */
  onOpenModel: (chunk: ConsumeChunk, lens: AltKey) => void;
  onCloseModel: () => void;
  onToggleTerm: (key: string) => void;
  onToggleCollapse: (chunkId: string) => void;
  /** Open the ask panel on a chunk. `selection` is "" for the whole section. */
  onOpenPassage: (chunkId: string, selection: string) => void;
  onClosePassage: () => void;
  /** Submit the question — the answer streams back into `session.passage`. */
  onAskPassage: (question: string) => void;
  onSkipCrucible: () => void;
  onRoutePrereq: () => void;
  /** Set when the reading pass stopped mid-stream. The sections that landed
   *  stay exactly as they are; this is the notice pinned under them. */
  incomplete?: { onRetry: () => void };
}

export default function ConsumeView({
  title,
  chunks,
  streaming = false,
  session,
  modelBeats,
  modelStreaming = false,
  onExit,
  onCheck,
  onContinue,
  onFinish,
  onBeginSocratic,
  onOpenModel,
  onCloseModel,
  onToggleTerm,
  onToggleCollapse,
  onOpenPassage,
  onClosePassage,
  onAskPassage,
  onSkipCrucible,
  onRoutePrereq,
  incomplete,
  presence,
}: ConsumeViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const controls = altControls(language);

  /** The lens last opened over a chunk, or null. This is a record of what the
   *  learner reached for — it marks a control, it never changes the prose. */
  const lensOf = (chunkId: string): AltKey | null => session.variant[chunkId] ?? null;
  /** …and whether the learned default is what's being suggested here, because
   *  they haven't opened a lens over this section themselves. */
  const suggestsDefault = (chunkId: string) =>
    !session.variant[chunkId] && session.preferred !== null;

  // Read-aloud: the reading pass is the one place in Atlas long enough to be
  // worth listening to. One section speaks at a time — starting another
  // cancels the first — and the hook cancels on unmount, since the audio
  // element would otherwise keep talking after the learner leaves.
  const { readAloud: readAloudPref } = useVoicePrefs();
  const reading = useReadAloud({ language });
  const [spoken, setSpoken] = useState<string | null>(null);
  const voiceOn = reading.supported && readAloudPref;
  // The section the control belongs to. `error` counts as attached: the
  // failure has to stay on the section it happened to, or the learner is told
  // something went wrong with no way to tell what.
  const speakingChunk = reading.status === "idle" ? null : spoken;
  const readingFailedOn = reading.status === "error" ? spoken : null;
  /** What a chunk reads aloud: its prose, its worked example, its takeaway.
   *  The voice reads what's on the page — and since a lens now opens *over*
   *  the section instead of rewriting it, that is never anything but this. */
  const segmentsOf = (c: ConsumeChunk) => segmentsForChunk(c);
  const toggleReading = (c: ConsumeChunk) => {
    if (speakingChunk === c.id && reading.status !== "error") {
      if (reading.status === "paused") reading.resume();
      else reading.pause();
      return;
    }
    // A click on a failed reading is a retry, not a no-op — `speak` starts the
    // section over, and the clip cache means anything that already landed
    // costs nothing the second time.
    setSpoken(c.id);
    reading.speak(segmentsOf(c));
  };

  // Only sections up to the deepest revealed one are on screen — the pass
  // unfolds in segments, never as a wall.
  const visible = chunks.slice(0, session.idx + 1);

  // The section the open lens belongs to, looked up rather than carried in
  // session state: while the pass is still streaming a section can be replaced
  // in place, and the view must render the copy that is actually on screen.
  const modelChunk = session.model
    ? chunks.find((c) => c.id === session.model?.chunkId)
    : undefined;
  // The lens dialog animates out after `session.model` has already cleared, so
  // the last open one is held back for those frames.
  const lastModel = useRef<{
    key: string;
    lens: AltKey;
    chunk: ConsumeChunk;
  } | null>(null);
  if (session.model && modelChunk) {
    lastModel.current = {
      key: `${session.model.chunkId}:${session.model.lens}`,
      lens: session.model.lens,
      chunk: modelChunk,
    };
  }

  let simpleCount = 0;
  for (const c of chunks) if (lensOf(c.id) === "simpler") simpleCount++;

  // Missing-prerequisite flag: leaning on "simpler" repeatedly. A learned
  // preference doesn't count as reaching for it — it's a default they set once.
  const simpleFlag = simpleCount >= 3 && session.preferred !== "simpler";

  const breadcrumb = PHASES.slice(0, 6).join(" → ");

  // Honest time-left estimate: word count of what's left, at ~200wpm.
  // ponytail: while still streaming we don't yet know the pass's true length
  // (4-6 sections), so the average size of what's landed so far stands in
  // for sections not yet written — close enough to plan a skim vs. a read.
  const wordsOf = (c: ConsumeChunk) =>
    c.body.join(" ").split(/\s+/).filter(Boolean).length +
    c.example.steps.join(" ").split(/\s+/).filter(Boolean).length;
  const readWords = chunks
    .slice(0, session.idx + 1)
    .reduce((sum, c) => sum + wordsOf(c), 0);
  const knownWords = chunks.reduce((sum, c) => sum + wordsOf(c), 0);
  const avgWords = chunks.length ? knownWords / chunks.length : 0;
  const projectedTotal = streaming ? Math.max(knownWords, avgWords * 5) : knownWords;
  const minutesLeft = Math.round(Math.max(0, projectedTotal - readWords) / 200);

  // Highlight → ask: a small floating button follows text selection inside
  // any section's prose, instead of a permanent link under every one of them.
  const [askHint, setAskHint] = useState<{
    chunkId: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.isCollapsed || !text) {
        setAskHint(null);
        return;
      }
      const anchor = sel.anchorNode;
      const el = anchor instanceof Element ? anchor : anchor?.parentElement;
      const prose = el?.closest("[data-chunk-id]") as HTMLElement | null;
      if (!prose) {
        setAskHint(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const parentRect = prose.getBoundingClientRect();
      setAskHint({
        chunkId: prose.dataset.chunkId!,
        text,
        x: rect.left - parentRect.left + rect.width / 2,
        y: rect.top - parentRect.top,
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // ---- the closing beat ---------------------------------------------------
  // Finishing the last section used to drop the learner straight into
  // Socratic. The reading is 8-15 minutes of work; it earns a beat that says
  // what it added before the next phase starts taking it away again.
  const totalWords = knownWords;
  const readMinutes = Math.max(1, Math.round(totalWords / 200));
  const termLabels = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of chunks)
      for (const term of c.terms) byKey.set(`${c.id}:${term.t}`, term.t);
    return session.termsSeen.map((k) => byKey.get(k)).filter((v): v is string => !!v);
  }, [chunks, session.termsSeen]);

  if (session.recap) {
    const stat = (text: string) => (
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: color.inkMuted,
        }}
      >
        <Rich text={text} />
      </span>
    );

    return (
      <Sheet
        presence={presence}
        style={{
          overflowY: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "72px 32px 100px",
          }}
        >
          <div style={{ ...kicker(11), color: color.accent, marginBottom: 12 }}>
            {t.recapKicker}
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 36,
              lineHeight: 1.12,
              margin: "0 0 12px",
            }}
          >
            {t.recapTitle(title)}
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: color.inkMuted,
              margin: "0 0 18px",
            }}
          >
            {t.recapLead}
          </p>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 38,
            }}
          >
            {stat(t.recapSections(chunks.length))}
            {stat(t.recapMinutes(readMinutes))}
            {termLabels.length > 0 && stat(t.recapTerms(termLabels.length))}
          </div>

          <div style={{ ...kicker(10), marginBottom: 14 }}>{t.recapTakeaways}</div>
          <ol style={{ margin: "0 0 36px", padding: 0, listStyle: "none" }}>
            {chunks.map((c, i) => (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "baseline",
                  padding: "13px 0",
                  borderBottom: `1px solid ${color.hairline}`,
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.inkGhost,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: 17,
                      lineHeight: 1.5,
                      color: color.ink,
                    }}
                  >
                    <Rich text={c.takeaway} />
                  </span>
                  {session.collapsed[c.id] && (
                    <span
                      style={{
                        marginLeft: 9,
                        fontFamily: font.mono,
                        fontSize: 9.5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: color.inkGhost,
                      }}
                    >
                      {t.recapSkipped}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {termLabels.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ ...kicker(10), marginBottom: 12 }}>{t.recapTermsHeading}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {termLabels.map((label) => (
                  <span
                    key={label}
                    style={{
                      padding: "5px 11px",
                      background: color.chipBg,
                      border: `1px solid ${color.hairlineStrong}`,
                      borderRadius: 20,
                      fontSize: 12.5,
                      color: color.inkSoft,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <button
              className="at-press"
              onClick={onBeginSocratic}
              style={{
                padding: "14px 24px",
                background: color.accent,
                color: color.accentInk,
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
              }}
            >
              {t.recapBegin}
            </button>
            <button
              className="at-press"
              onClick={onExit}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                fontSize: 13.5,
                color: color.inkMuted,
                cursor: "pointer",
              }}
            >
              {t.recapBackToMap}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet presence={presence} data-testid="phase-consume" aria-label="Consume — {title}">
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 58,
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          className="at-press"
          onClick={() => {
            reading.cancel();
            onExit();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {t.back}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: BLUE,
          }}
        >
          {t.sessionLabel}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.inkGhost,
          }}
        >
          {breadcrumb}
        </span>
        {/* The escape hatch, always open: nobody should have to read past
            what they already know to prove they know it. */}
        <button
          className="at-press"
          onClick={onSkipCrucible}
          style={{
            background: "none",
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 8,
            padding: "5px 11px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            color: color.inkMuted,
          }}
        >
          {t.iKnowThis}
        </button>
      </div>

      {/* Segment progress — each revealed segment jumps straight to its
          section, instead of scroll-then-Continue being the only way back to
          it. Real buttons: this is navigation, and navigation has to be
          reachable from the keyboard. */}
      <nav
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 24px 0",
        }}
      >
        <div style={{ flex: 1, display: "flex", gap: 6 }}>
          {chunks.map((c, i) => {
            const reachable = i <= session.idx;
            return (
              <button
                className="at-press"
                key={c.id}
                type="button"
                disabled={!reachable}
                aria-label={t.jumpTo(i + 1, sectionName(c.kicker))}
                aria-current={i === session.idx ? "step" : undefined}
                onClick={() =>
                  document
                    .getElementById(c.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                style={{
                  flex: 1,
                  // The bar is 3px; the button is tall enough to hit, with the
                  // bar drawn inside it.
                  height: 14,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  background: "none",
                  border: "none",
                  cursor: reachable ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    height: 3,
                    borderRadius: 2,
                    background: reachable ? color.accent : "rgba(44,40,35,0.12)",
                    transition: transition("background"),
                  }}
                />
              </button>
            );
          })}
        </div>
        {minutesLeft > 0 && (
          <span
            style={{
              flex: "0 0 auto",
              fontFamily: font.mono,
              fontSize: 10.5,
              color: color.inkGhost,
            }}
          >
            {t.minLeft(minutesLeft)}
          </span>
        )}
      </nav>

      {/* Reading column */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 940,
            margin: "0 auto",
            padding: "40px 32px 120px",
          }}
        >
          <div style={{ ...kicker(11), marginBottom: 10 }}>{t.kicker}</div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.12,
              margin: "0 0 8px",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: color.inkMuted,
              margin: "0 0 34px",
              maxWidth: 640,
              lineHeight: 1.55,
            }}
          >
            {/* While still streaming, `chunks.length` is a running count, not
                the pass's final section count — fall back to the no-count
                phrasing rather than announcing a number that's about to
                change. */}
            {t.intro(streaming ? 0 : chunks.length)} {t.introTail}
          </p>

          {/* The very first open of a fresh node: the screen is already up,
              the first section is still being written. A blank page reads as
              broken; a shape of what's coming reads as "in progress". */}
          {chunks.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                animation: "fadeUp .3s both",
              }}
            >
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11.5,
                  color: color.inkGhost,
                  marginBottom: 4,
                }}
              >
                {t.writingFirst}
              </div>
              <SkeletonBars
                widths={[220, 100, "94%", "88%", "70%"]}
                heights={[22, 14, 14, 14, 14]}
              />
            </div>
          )}

          {visible.map((c, i) => {
            const vkey = lensOf(c.id);
            const isDeepest = i === visible.length - 1;
            // While streaming, the deepest chunk in hand isn't provably the
            // pass's last section yet — never claim "last" until the stream
            // has actually finished.
            const isLast = i === chunks.length - 1 && !streaming;
            const nextArrived = i + 1 < chunks.length;
            const collapsed = !!session.collapsed[c.id];
            // The prose stays put. A lens (below) opens *over* it — the
            // passage a learner is mid-way through is the last thing that
            // should disappear when they ask for help with it.
            const paragraphs = c.body;
            const checkPassed = !c.check || !!session.checks[c.id]?.correct;

            return (
              <div
                key={c.id}
                id={c.id}
                style={{
                  marginBottom: 40,
                  paddingBottom: 40,
                  borderBottom: `1px solid rgba(44,40,35,0.08)`,
                  animation: "fadeUp 0.4s both",
                  scrollMarginTop: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: BLUE,
                    }}
                  >
                    {c.kicker}
                  </span>
                  {voiceOn && !collapsed && (
                    <SpeakerButton
                      status={speakingChunk === c.id ? reading.status : "idle"}
                      progress={speakingChunk === c.id ? reading.progress : 0}
                      onClick={() => toggleReading(c)}
                    />
                  )}
                  {voiceOn && !collapsed && readingFailedOn === c.id && (
                    // Read-aloud used to fail silently — the control just went
                    // back to idle and the learner was left clicking a button
                    // that appeared to do nothing.
                    <span
                      style={{
                        ...kicker(9.5, "0.1em"),
                        color: color.dangerInk,
                        animation: `softIn ${motion.duration.fast}ms both`,
                      }}
                    >
                      {t.readingFailedNote}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    className="at-press"
                    onClick={() => onToggleCollapse(c.id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: 12,
                      color: color.inkFaint,
                      cursor: "pointer",
                    }}
                  >
                    {collapsed ? t.showFullSection : t.skipSection}
                  </button>
                </div>

                {collapsed && (
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 16,
                      color: color.inkSoft,
                      paddingLeft: 14,
                      borderLeft: `3px solid ${color.hairlineStrong}`,
                    }}
                  >
                    <Rich text={c.takeaway} />
                  </div>
                )}

                {/* Pre-taught terms */}
                {!collapsed && (
                  <>
                    {c.terms.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          marginBottom: 18,
                        }}
                      >
                        {c.terms.map((term) => {
                          const key = `${c.id}:${term.t}`;
                          const open = session.term === key;
                          return (
                            <div
                              key={key}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <button
                                className="at-press"
                                onClick={() => onToggleTerm(key)}
                                aria-expanded={open}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 7,
                                  padding: "5px 11px",
                                  background: color.chipBg,
                                  border: `1px solid ${color.hairlineStrong}`,
                                  borderRadius: 20,
                                  fontSize: 12.5,
                                  color: color.inkSoft,
                                  cursor: "pointer",
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: font.mono,
                                    fontSize: 9,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: color.amberInk,
                                  }}
                                >
                                  {t.term}
                                </span>
                                <Rich text={term.t} />
                              </button>
                              {open && (
                                <div
                                  style={{
                                    marginTop: 7,
                                    maxWidth: 340,
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    color: color.inkSoft,
                                    background: color.amberBg,
                                    border: "1px solid rgba(160,106,48,0.2)",
                                    borderRadius: 9,
                                    padding: "9px 12px",
                                    animation: "fadeUp .25s both",
                                  }}
                                >
                                  <Rich text={term.d} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* The material — dual-coded, and on screen from the start. */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: c.figure ? "1fr 300px" : "1fr",
                        gap: 30,
                        alignItems: "start",
                      }}
                    >
                      <div data-chunk-id={c.id} style={{ position: "relative" }}>
                        {askHint?.chunkId === c.id && (
                          <button
                            className="at-press"
                            onClick={() => {
                              const text = askHint.text;
                              window.getSelection()?.removeAllRanges();
                              setAskHint(null);
                              onOpenPassage(c.id, text);
                            }}
                            style={{
                              position: "absolute",
                              left: askHint.x,
                              top: askHint.y - 34,
                              transform: "translateX(-50%)",
                              zIndex: 5,
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "none",
                              background: color.accent,
                              color: color.accentInk,
                              fontSize: 12.5,
                              fontFamily: "inherit",
                              fontWeight: 600,
                              cursor: "pointer",
                              boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.askFloating}
                          </button>
                        )}
                        {/* The prose itself. It is always the section's own — a
                        lens opens over it, never in place of it — so the
                        read-aloud highlight tracks these paragraphs directly. */}
                        {paragraphs.map((para, pi) => {
                          // Prose paragraphs lead the spoken segments, so the
                          // reading index maps straight onto them.
                          const spokenNow =
                            speakingChunk === c.id && reading.index === pi;
                          return (
                            <p
                              key={pi}
                              style={{
                                fontFamily: font.serif,
                                fontSize: 19,
                                lineHeight: 1.68,
                                margin: "0 -8px 18px",
                                padding: "2px 8px",
                                borderRadius: 7,
                                background: spokenNow ? color.accentBg : "transparent",
                                transition: transition("background"),
                                color: color.ink,
                              }}
                            >
                              {/* Two scales of highlight, because they answer two
                              questions: the paragraph wash says where the voice
                              is on the page, the word mark says where it is in
                              the sentence. The word range is an offset into
                              `spokenText(para)` — the same strip `Rich` renders
                              through — so it needs no mapping here. */}
                              <Rich text={para} speak={spokenNow ? reading.word : null} />
                            </p>
                          );
                        })}

                        <WorkedExample example={c.example} />

                        <div
                          style={{
                            marginTop: 22,
                            display: "flex",
                            gap: 12,
                            alignItems: "baseline",
                            background: color.accentBg,
                            border: "1px solid rgba(47,107,79,0.18)",
                            borderRadius: 10,
                            padding: "13px 16px",
                          }}
                        >
                          <span
                            style={{
                              flex: "0 0 auto",
                              fontFamily: font.mono,
                              fontSize: 9.5,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: color.accent,
                            }}
                          >
                            {t.takeaway}
                          </span>
                          <span
                            style={{
                              fontFamily: font.serif,
                              fontSize: 16.5,
                              lineHeight: 1.5,
                              color: color.ink,
                            }}
                          >
                            <Rich text={c.takeaway} />
                          </span>
                        </div>

                        {/* Where to go next on this, not a citation of the prose
                        above — the app can't verify a source, and dressing a
                        model-written reference as one buys trust it hasn't
                        earned. Named as what it is. */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 12,
                            flexWrap: "wrap",
                            margin: "14px 0",
                          }}
                        >
                          {/* Absent when the model had no work it was confident
                          exists — an omitted line beats an invented title. */}
                          {c.cite ? (
                            <span style={{ fontSize: 11, color: color.inkFaint }}>
                              {t.furtherReading} · {c.cite}
                            </span>
                          ) : null}
                          <div style={{ flex: 1 }} />
                          {/* The keyboard path to the same panel the highlight
                          gesture opens — selecting text is a pointer move. */}
                          <button
                            className="at-press"
                            onClick={() => onOpenPassage(c.id, "")}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              fontFamily: "inherit",
                              fontSize: 12,
                              color: color.accent,
                              cursor: "pointer",
                            }}
                          >
                            {t.askSection}
                          </button>
                        </div>

                        {/* The four lenses. Each opens a model view over this
                        section — generated on demand for this section's exact
                        prose, so there is nothing to wait for before they are
                        offered. The one last opened stays marked: that is the
                        adaptive-modality record, and what the
                        missing-prerequisite flag counts. */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          {controls.map(([key, label]) => {
                            const used = vkey === key;
                            // The learned default is marked on sections the
                            // learner hasn't opened a lens over themselves — it
                            // leads them to it without opening anything for them.
                            const suggested =
                              suggestsDefault(c.id) && session.preferred === key;
                            return (
                              <button
                                className="at-press"
                                key={key}
                                onClick={() => onOpenModel(c, key)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  cursor: "pointer",
                                  fontFamily: font.mono,
                                  border: `1px solid ${
                                    used || suggested
                                      ? color.accent
                                      : color.hairlineStrong
                                  }`,
                                  background: used ? color.accentBg : color.card,
                                  color:
                                    used || suggested ? color.accent : color.inkMuted,
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {/* Says which one is theirs, so a marked control never
                          looks like a glitch. */}
                          {suggestsDefault(c.id) && (
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: color.inkGhost,
                              }}
                            >
                              {t.yourDefault}
                            </span>
                          )}
                        </div>

                        {/* Ask about this — the learner's own question about the
                        passage they highlighted, answered against this
                        section. */}
                        {session.passage?.chunkId === c.id && (
                          <PassagePanel
                            ask={session.passage}
                            suggestion={c.ask}
                            onAsk={onAskPassage}
                            onClose={onClosePassage}
                          />
                        )}
                      </div>
                      {c.figure && (
                        <div style={{ position: "sticky", top: 12 }}>
                          <Figure
                            id={c.id}
                            figure={c.figure}
                            caption={c.diagram ?? sectionName(c.kicker)}
                          />
                          <div
                            style={{
                              marginTop: 9,
                              fontFamily: font.mono,
                              fontSize: 10.5,
                              lineHeight: 1.45,
                              color: color.inkFaint,
                            }}
                          >
                            {t.diagramLabel} {c.diagram}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* The section's receipt: answered right, the way onward
                    appears; until then it is the only thing down here. */}
                {c.check && (
                  <SectionCheck
                    check={c.check}
                    answer={session.checks[c.id]}
                    onAnswer={(oi, correct) => onCheck(c.id, oi, correct)}
                  />
                )}

                {/* Continue / finish — only on the deepest revealed section,
                    and only once its check is passed (sections cached before
                    checks existed carry none, and stay ungated). */}
                {isDeepest &&
                  checkPassed &&
                  (nextArrived || isLast ? (
                    <div style={{ marginTop: 30 }}>
                      <button
                        className="at-press"
                        onClick={() => (isLast ? onFinish() : onContinue(i))}
                        style={
                          isLast
                            ? {
                                padding: "14px 24px",
                                background: color.accent,
                                color: color.accentInk,
                                border: "none",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
                              }
                            : {
                                padding: "12px 20px",
                                background: color.card,
                                color: color.ink,
                                border: `1px solid ${color.hairlineStrong}`,
                                borderRadius: 11,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }
                        }
                      >
                        {isLast
                          ? t.finishBeginSocratic
                          : t.continueSection(sectionName(chunks[i + 1].kicker))}
                      </button>
                    </div>
                  ) : (
                    // Caught up to the writer — the next section is still
                    // being generated.
                    <div
                      style={{
                        marginTop: 30,
                        fontSize: 13,
                        color: color.inkFaint,
                        fontStyle: "italic",
                      }}
                    >
                      {t.writingNext}
                    </div>
                  ))}
              </div>
            );
          })}

          {/* The stream died after some sections had landed. Everything above
              is real and readable; this says the rest isn't coming, which is
              the one thing a pass that simply stops can't say for itself. */}
          {incomplete && (
            <div style={{ margin: "8px 0 28px", maxWidth: 640 }}>
              <InlineError
                message={t.readingIncomplete}
                retryLabel={t.readingRetry}
                onRetry={incomplete.onRetry}
              />
            </div>
          )}

          {/* Edge case: leaning on "simpler" — flag a missing prerequisite */}
          {simpleFlag && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: color.amberBg,
                border: "1px solid rgba(160,106,48,0.28)",
                borderRadius: 13,
                padding: "18px 22px",
                animation: "fadeUp .4s both",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    marginBottom: 3,
                  }}
                >
                  {t.simplifyingTitle}
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted }}>
                  {t.simplifyingBody}
                </div>
              </div>
              <button
                className="at-press"
                onClick={onRoutePrereq}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  background: color.card,
                  color: color.amberInk,
                  border: "1px solid rgba(160,106,48,0.4)",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.reviewPrereq}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The open lens. Mounted last and fixed-positioned, so the section it
          belongs to is still there — and still scrolled where the learner
          left it — the moment this closes. Keyed on section + lens so
          switching lenses restarts the cascade rather than continuing the
          previous one's count. */}
      {(modelChunk && session.model ? true : lastModel.current !== null) && (
        <ModelView
          key={
            modelChunk && session.model
              ? `${session.model.chunkId}:${session.model.lens}`
              : lastModel.current!.key
          }
          open={Boolean(modelChunk && session.model)}
          lens={session.model?.lens ?? (lastModel.current!.lens as AltKey)}
          chunk={modelChunk ?? lastModel.current!.chunk}
          beats={modelBeats ?? []}
          streaming={modelStreaming}
          onClose={onCloseModel}
        />
      )}
    </Sheet>
  );
}
