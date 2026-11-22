"use client";

// One reel card: a full screen holding one thing — a pretest, a beat of the
// prose, the worked example, the figure, the check, the takeaway. Which cards
// exist is `consumeReel`'s business; this only draws one of them, with the
// action rail beside it and the way on beneath it.

import { SkeletonBars } from "@/components/Pending";
import Rich from "@/components/Rich";
import type { AltKey, ConsumeChunk, ReelCard } from "@/lib/curriculum";
import { reelSpoken } from "@/lib/curriculum";
import type { SpeakRange } from "@/lib/rich";
import type { ReadStatus } from "@/lib/speech";
import { color, font, kicker, motion } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { BLUE, STRINGS, type ConsumeSession } from "../consume/shared";
import { Figure } from "../consume/Figure";
import { SectionCheck } from "../consume/SectionCheck";
import { TermPills } from "../consume/TermPills";
import { sectionName } from "../consume/SpeakerButton";
import { ReelRail } from "./ReelRail";
import { ReelNextCard, ReelNextSection, reelAction } from "./ReelNav";

/** What every card needs from the screen around it. */
export interface ReelCtx {
  topic: string;
  title: string;
  chunks: ConsumeChunk[];
  session: ConsumeSession;
  nextLabel?: string;
  controls: ReadonlyArray<[AltKey, string]>;
  /** Read-aloud: on at all, which card is speaking, and where it is. */
  voice: {
    on: boolean;
    card: string | null;
    status: ReadStatus;
    index: number;
    word: SpeakRange | null;
  };
  onListen: (card: ReelCard) => void;
  onNext: () => void;
  onPretest: (chunkId: string, oi: number, correct: boolean) => void;
  onCheck: (chunkId: string, oi: number, correct: boolean) => void;
  onContinue: (chunkIndex: number) => void;
  onFinish: () => void;
  onToggleTerm: (key: string) => void;
  onToggleCollapse: (chunkId: string) => void;
  onOpenModel: (chunk: ConsumeChunk, lens: AltKey) => void;
  onOpenPassage: (chunkId: string, selection: string) => void;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Type that fills a phone at a glance and shrinks as the beat grows. */
const beatSize = (text: string) =>
  words(text) <= 28
    ? "clamp(22px, 6vw, 30px)"
    : words(text) <= 50
      ? "clamp(20px, 5.2vw, 25px)"
      : "clamp(18px, 4.6vw, 21px)";

export function ReelCardView({
  card,
  index,
  total,
  at,
  of,
  seen,
  ctx,
}: {
  card: ReelCard;
  index: number;
  /** Cards in the feed, so the last one offers no "next". */
  total: number;
  /** Position within its section, 1-based, and the section's card count. */
  at: number;
  of: number;
  /** Has been on screen — its entrance has played. */
  seen: boolean;
  ctx: ReelCtx;
}) {
  const t = useT(STRINGS);
  const { session } = ctx;
  const chunk = "chunk" in card ? card.chunk : ctx.chunks[card.section];
  const speaking = ctx.voice.card === card.key;
  const spokenWord = speaking && ctx.voice.index === 0 ? ctx.voice.word : null;
  const hasRail =
    ["beat", "example", "figure"].includes(card.kind) ||
    (card.kind === "takeaway" && !card.collapsed);

  const body = (() => {
    switch (card.kind) {
      case "writing":
        return (
          <div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.inkGhost,
                marginBottom: 14,
              }}
            >
              {card.key === "writing:first" ? t.writingFirst : t.writingNext}
            </div>
            <SkeletonBars widths={["92%", "86%", "70%"]} heights={22} />
          </div>
        );
      case "pretest":
        return (
          <SectionCheck
            pretest
            topic={ctx.topic}
            nodeLabel={ctx.title}
            check={card.chunk.check!}
            onAnswer={(oi, correct) => ctx.onPretest(card.chunk.id, oi, correct)}
          />
        );
      case "beat":
        return (
          <>
            {card.first && (
              <TermPills
                chunkId={card.chunk.id}
                terms={card.chunk.terms}
                openKey={session.term}
                onToggle={ctx.onToggleTerm}
              />
            )}
            {card.first && session.pretest?.[card.chunk.id] === false && (
              <div style={{ ...kicker(10, "0.1em"), color: BLUE, marginBottom: 12 }}>
                {t.pretestMissNote}
              </div>
            )}
            <p
              className={card.first && card.section === 0 ? "at-dropcap" : undefined}
              style={{
                fontFamily: font.serif,
                fontSize: beatSize(card.text),
                lineHeight: 1.45,
                margin: 0,
                color: color.ink,
              }}
            >
              <Rich text={card.text} speak={spokenWord} />
            </p>
          </>
        );
      case "example":
        return (
          <div style={{ borderLeft: `3px solid ${BLUE}`, paddingLeft: 18 }}>
            <div style={{ ...kicker(10), color: BLUE, marginBottom: 8 }}>
              {t.workedExample}
            </div>
            <div
              style={{
                fontFamily: font.display,
                fontSize: 22,
                lineHeight: 1.2,
                marginBottom: 16,
              }}
            >
              <Rich text={card.chunk.example.title} />
            </div>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: 12,
              }}
            >
              {card.chunk.example.steps.map((step, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: font.serif,
                    fontSize: "clamp(17px, 4.4vw, 20px)",
                    lineHeight: 1.45,
                    // Steps land one after another as the card arrives — the
                    // moves are seen as moves, not as a block.
                    opacity: seen ? undefined : 0,
                    animation: seen
                      ? `fadeUp ${motion.duration.slow}ms ${motion.ease.enter} ${i * motion.duration.deliberate}ms both`
                      : "none",
                  }}
                >
                  <Rich text={step} />
                </li>
              ))}
            </ol>
          </div>
        );
      case "figure":
        return (
          <div>
            <Figure
              id={`reel-${card.chunk.id}`}
              figure={card.chunk.figure!}
              caption={card.chunk.diagram ?? sectionName(card.chunk.kicker)}
            />
            {card.chunk.diagram && (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.inkFaint,
                }}
              >
                {t.diagramLabel} {card.chunk.diagram}
              </div>
            )}
          </div>
        );
      case "check": {
        const answered = !!session.checks[card.chunk.id];
        return (
          <>
            <SectionCheck
              topic={ctx.topic}
              nodeLabel={ctx.title}
              check={card.chunk.check!}
              guessMissed={session.pretest?.[card.chunk.id] === false}
              answer={session.checks[card.chunk.id]}
              onAnswer={(oi, correct) => ctx.onCheck(card.chunk.id, oi, correct)}
            />
            {answered && !card.next && (
              <button
                type="button"
                className="at-press"
                onClick={ctx.onNext}
                style={reelAction(false)}
              >
                {t.afterCheck}
              </button>
            )}
          </>
        );
      }
      case "takeaway": {
        const known = card.collapsed && !!session.pretest?.[card.chunk.id];
        return (
          <>
            <div
              style={{ ...kicker(10, "0.12em"), color: color.accent, marginBottom: 14 }}
            >
              {known ? t.pretestKnown : t.takeaway}
            </div>
            <p
              style={{
                fontFamily: font.display,
                fontSize: "clamp(23px, 6.2vw, 31px)",
                lineHeight: 1.25,
                margin: 0,
                color: color.ink,
              }}
            >
              <Rich text={card.chunk.takeaway} speak={spokenWord} />
            </p>
            {card.collapsed && (
              <button
                type="button"
                className="at-press"
                onClick={() => ctx.onToggleCollapse(card.chunk.id)}
                style={{ ...reelAction(false), marginTop: 22, fontSize: 13 }}
              >
                {t.showFullSection}
              </button>
            )}
            {!card.collapsed && card.chunk.cite && (
              <div style={{ marginTop: 18, fontSize: 11.5, color: color.inkFaint }}>
                {t.furtherReading} · {card.chunk.cite}
              </div>
            )}
          </>
        );
      }
    }
  })();

  return (
    <section
      data-reel={index}
      data-reel-kind={card.kind}
      className="at-reel-card"
      aria-label={chunk ? `${sectionName(chunk.kicker)} · ${at}/${of}` : undefined}
      style={{
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 20px 60px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="at-reel-col"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "100%",
          overflowY: "auto",
          padding: "4px 2px",
        }}
      >
        {chunk && (
          <div
            style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}
          >
            <span style={{ ...kicker(11, "0.12em"), color: BLUE }}>{chunk.kicker}</span>
            <span
              style={{ fontFamily: font.mono, fontSize: 10.5, color: color.inkGhost }}
            >
              {at}/{of}
            </span>
          </div>
        )}
        {body}
        <ReelNextSection
          next={card.next}
          nextSection={sectionName(ctx.chunks[card.section + 1]?.kicker ?? "")}
          nextPhase={ctx.nextLabel}
          onContinue={() => ctx.onContinue(card.section)}
          onFinish={ctx.onFinish}
        />
      </div>

      {hasRail && chunk && (
        <ReelRail
          controls={ctx.controls}
          used={session.variant[chunk.id] ?? null}
          suggested={session.variant[chunk.id] ? null : session.preferred}
          onLens={(lens) => ctx.onOpenModel(chunk, lens)}
          onAsk={() => ctx.onOpenPassage(chunk.id, card.kind === "beat" ? card.text : "")}
          listen={
            ctx.voice.on && reelSpoken(card)
              ? {
                  status: speaking ? ctx.voice.status : "idle",
                  onClick: () => ctx.onListen(card),
                }
              : null
          }
          onSkip={card.kind === "beat" ? () => ctx.onToggleCollapse(chunk.id) : undefined}
        />
      )}

      {index < total - 1 && <ReelNextCard first={index === 0} onNext={ctx.onNext} />}
    </section>
  );
}
