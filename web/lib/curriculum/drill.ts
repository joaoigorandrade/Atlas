// ---- Phase · Drill (speed and automaticity) --------------------------------
// The same small call, made over and over until it stops being derived and
// starts being known. The only phase that measures *how long* an answer took,
// which is the whole reason it exists: a learner who reaches the right answer
// by re-deriving it every time has not automated anything, and no other rung
// can see the difference.
//
// Run by a `fact` and a `procedure`, the two kinds that fail this way. A
// `principle` is meant to be reasoned through, so timing it would reward the
// wrong thing.

import { Language } from "@/lib/i18n";

/** Drill's accent: a warm copper — something being worn smooth. */
export const DRILL_COLOR = {
  accent: "#8e5a2b",
  soft: "rgba(142,90,43,0.08)",
  border: "rgba(142,90,43,0.32)",
} as const;

/** What "without stopping to derive it" means, in milliseconds per call.
 *  Reported against, never gated on — see `drillPassed`. */
export const DRILL_TARGET_MS = 8000;

/** One rep. No context, no setup: a drill item is its prompt and nothing else. */
export interface DrillRep {
  id: string;
  prompt: string;
  /** Short answers. The wrong ones are the slips made at speed — the
   *  off-by-one, the swapped pair, the inverted ratio. */
  answers: string[];
  answerIndex: number;
  /** The one-line rule that produces the answer directly, so next time it
   *  fires instead of being worked out. */
  rule: string;
}

export interface DrillContent {
  nodeId: string;
  nodeLabel: string;
  reps: DrillRep[];
}

export interface DrillSession {
  nodeId: string;
  index: number;
  /** Committed answer per rep id. */
  hits: Record<string, number>;
  /** Milliseconds spent on each rep — the signal. */
  took: Record<string, number>;
  /** When the open rep was put on screen. */
  openedAt: number;
  /** How sure they were of these calls, tapped before the first rep (an index
   *  into `CONFIDENCE_FELT`). The clock starts on the tap, not before it. */
  sure?: number;
  done: boolean;
}

export function drillStart(nodeId: string, now = Date.now()): DrillSession {
  return { nodeId, index: 0, hits: {}, took: {}, openedAt: now, done: false };
}

export type DrillAction =
  | { type: "sure"; level: number; now?: number }
  | { type: "answer"; index: number; now?: number }
  | { type: "next"; now?: number };

export function drillReducer(
  session: DrillSession,
  action: DrillAction,
  content: DrillContent,
): DrillSession {
  const rep = content.reps[session.index];
  switch (action.type) {
    case "sure":
      if (session.sure !== undefined || Object.keys(session.hits).length) return session;
      // The first rep goes on screen now, so its clock starts now.
      return { ...session, sure: action.level, openedAt: action.now ?? Date.now() };
    case "answer": {
      if (!rep || session.hits[rep.id] !== undefined) return session;
      const now = action.now ?? Date.now();
      return {
        ...session,
        hits: { ...session.hits, [rep.id]: action.index },
        took: { ...session.took, [rep.id]: Math.max(0, now - session.openedAt) },
      };
    }
    case "next": {
      if (!rep || session.hits[rep.id] === undefined) return session;
      const index = session.index + 1;
      return {
        ...session,
        index,
        openedAt: action.now ?? Date.now(),
        done: index >= content.reps.length || drillEarly(session, content),
      };
    }
    default:
      return session;
  }
}

/** Reps that can end a run: this many from the first, all right and at speed. */
export const DRILL_EARLY_STREAK = 4;

/**
 * Early exit: the opening reps, every one right and inside the target time,
 * are already the proof the rest of the run exists to collect — automatic and
 * correct from the first call. Derived from `hits`/`took`, so a saved session
 * needs no new field. Only a run longer than the streak can end early.
 */
export function drillEarly(session: DrillSession, content: DrillContent): boolean {
  const opening = content.reps.slice(0, DRILL_EARLY_STREAK);
  return (
    content.reps.length > DRILL_EARLY_STREAK &&
    opening.every(
      (r) =>
        session.hits[r.id] === r.answerIndex &&
        (session.took[r.id] ?? Infinity) <= DRILL_TARGET_MS,
    )
  );
}

export function drillScore(session: DrillSession, content: DrillContent): number {
  return content.reps.filter((r) => session.hits[r.id] === r.answerIndex).length;
}

/**
 * Median milliseconds per rep. Median rather than mean because one interrupted
 * rep — a doorbell, a tab switch — should not describe the run.
 */
export function drillMedianMs(session: DrillSession, content: DrillContent): number {
  const times = content.reps
    .map((r) => session.took[r.id])
    .filter((ms): ms is number => typeof ms === "number")
    .sort((a, b) => a - b);
  if (!times.length) return 0;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
}

/** Reps answered correctly but slowly — right, and still being worked out.
 *  This is the finding Drill alone can produce. */
export function drillLabored(session: DrillSession, content: DrillContent): DrillRep[] {
  return content.reps.filter(
    (r) =>
      session.hits[r.id] === r.answerIndex && (session.took[r.id] ?? 0) > DRILL_TARGET_MS,
  );
}

/**
 * The reps that become review cards (W4.4): every one answered and not yet
 * automatic — missed, or right but slow. Automaticity forms across days,
 * which is where review lives; one timed sitting can only find which calls
 * still need it. Keyed on the rep, so a redo can't stack a second copy.
 */
export function drillCards(
  session: DrillSession,
  content: DrillContent,
): Array<{ key: string; front: string; back: string }> {
  return content.reps
    .filter((r) => {
      const hit = session.hits[r.id];
      if (hit === undefined) return false;
      return hit !== r.answerIndex || (session.took[r.id] ?? Infinity) > DRILL_TARGET_MS;
    })
    .map((r) => ({
      key: `${session.nodeId}-drill-${r.id}`,
      front: r.prompt,
      back: `${r.answers[r.answerIndex]} — ${r.rule}`,
    }));
}

/** Is the run automatic, as opposed to merely correct? Reported on the closing
 *  panel; deliberately not the gate. */
export function drillAutomatic(session: DrillSession, content: DrillContent): boolean {
  return (
    drillMedianMs(session, content) > 0 &&
    drillMedianMs(session, content) <= DRILL_TARGET_MS
  );
}

/**
 * Drill's gate: correctness, at the same two-thirds bar as its siblings.
 *
 * ponytail: speed is measured, surfaced, and named in the closing copy — a
 * phase that extracted no new signal would be a setting rather than a phase —
 * but it does not gate. A clock on the gate fails a learner who is right and
 * careful, and that is a dead end rather than a standard. Move the gate onto
 * `drillAutomatic` only with evidence that slow-and-right is the failure worth
 * blocking on; `drillLabored` is the reading that would show it.
 */
export function drillPassed(session: DrillSession, content: DrillContent): boolean {
  if (!content.reps.length) return session.done;
  if (drillEarly(session, content)) return true;
  return drillScore(session, content) >= Math.ceil(content.reps.length * (2 / 3));
}

const DRILL_COPY = {
  en: {
    kicker: "Drill",
    lead: "The same call, made without stopping to derive it.",
    howSure: "Before the clock starts: how sure are you that you'll get these right?",
    rule: "The rule that fires",
    pace: (s: string) => `${s}s a call, typically`,
    passed: "It comes without working for it. That is what automatic means.",
    missed: "Still being reasoned out rather than known. Run it again.",
    labored: "Right, but slowly — those are the ones still being derived.",
    early: "Ended early — a clean start is proof enough.",
    next: "Next →",
  },
  "pt-BR": {
    kicker: "Drill",
    lead: "A mesma decisão, sem parar para deduzir.",
    howSure: "Antes de o relógio começar: quanta certeza você tem de que vai acertar?",
    rule: "A regra que dispara",
    pace: (s: string) => `${s}s por decisão, em geral`,
    passed: "Sai sem esforço. É isso que significa estar automático.",
    missed: "Ainda está sendo deduzido em vez de sabido. Rode de novo.",
    labored: "Certo, mas devagar — esses ainda estão sendo deduzidos.",
    early: "Encerrado mais cedo — um começo limpo já é prova suficiente.",
    next: "Próximo →",
  },
} as const;

export function drillCopy(lang: Language = "en") {
  return DRILL_COPY[lang];
}
