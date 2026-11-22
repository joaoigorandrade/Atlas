"use client";

// The closing beat of a reading, shared by both ways of reading it (the reels
// and the page). Finishing the last section used to drop the learner straight
// into the next phase; a reading earns a beat that says what it added before
// the next phase starts taking it away again.

import { useMemo } from "react";
import {
  phaseLabel,
  pretestClean,
  proofGate,
  type ConsumeChunk,
  type PhaseId,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import Button from "@/components/ui/Button";
import Rich from "@/components/Rich";
import { STRINGS } from "./consume/shared";
import type { ConsumeSession } from "./consume/shared";

/** Words of prose and worked example — the honest size of a pass. */
export const passWords = (c: ConsumeChunk) =>
  c.body.join(" ").split(/\s+/).filter(Boolean).length +
  (c.example?.steps ?? []).join(" ").split(/\s+/).filter(Boolean).length;

export default function ConsumeRecap({
  title,
  plan,
  chunks,
  session,
  onBeginNext,
  onProve,
  onExit,
}: {
  title: string;
  plan: readonly PhaseId[];
  chunks: ConsumeChunk[];
  session: ConsumeSession;
  onBeginNext: () => void;
  onProve: () => void;
  onExit: () => void;
}) {
  const t = useT(STRINGS);
  // The rung owed next, per kind — none on a recognise-only (Consume, Retain) plan.
  const next = plan.find((p) => p !== "consume" && p !== "retain");
  const nextLabel = next && phaseLabel(next);
  // Every section known before it was read: proving it beats re-learning it.
  const knewAll = pretestClean(session, chunks.length);
  const readMinutes = Math.max(
    1,
    Math.round(chunks.reduce((sum, c) => sum + passWords(c), 0) / 200),
  );
  const termLabels = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of chunks)
      for (const term of c.terms) byKey.set(`${c.id}:${term.t}`, term.t);
    return session.termsSeen.map((k) => byKey.get(k)).filter((v): v is string => !!v);
  }, [chunks, session.termsSeen]);

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
      data-testid="phase-consume-recap"
      aria-label={`Consume — ${title}`}
      style={{ overflowY: "auto" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 32px 100px" }}>
        <div style={{ ...kicker(11), color: color.accent, marginBottom: 12 }}>
          {t.recapKicker}
        </div>
        <h1
          style={{
            fontFamily: font.display,
            fontWeight: 400,
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
          {t.recapLead(nextLabel)}
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 38 }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          {knewAll && (
            <Button data-testid="action-prove-known" onClick={onProve}>
              {t.recapProve(phaseLabel(proofGate(plan)))}
            </Button>
          )}
          <button
            className="at-press"
            data-testid="action-begin-next"
            onClick={onBeginNext}
            style={{
              padding: "14px 24px",
              background: knewAll ? "none" : color.accent,
              color: knewAll ? color.ink : color.accentInk,
              border: knewAll ? `1px solid ${color.hairlineStrong}` : "none",
              borderRadius: 3,
              fontSize: 15,
              fontFamily: font.caps,
              letterSpacing: "0.06em",
              cursor: "pointer",
              boxShadow: knewAll
                ? "none"
                : `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(246,239,223,0.34)`,
            }}
          >
            {t.recapBegin(nextLabel)}
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
