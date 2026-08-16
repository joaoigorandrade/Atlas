// ---- Phase 3b · Feynman (teach it back) -----------------------------------
// Gap detection through self-explanation. The learner gets a blank page and
// teaches the whole concept to a naive student in their own words — nothing
// prompts them, because what they never think to mention is the finding. The
// judge then diffs that explanation against a rubric they never saw: every
// sub-point green/grey/red, the jargon they leaned on without unpacking, and
// the words that earned each gap. Unresolved gaps write back to the map as red
// Gap sub-nodes quoting the learner, so the phase is the loop's connective
// tissue, not a checklist.
import { GapSpec } from "./replan";
import { SocraticStep } from "./socratic";
import { STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

/** A beat's verdict in the Gap Report: explained, skipped/hand-waved, or wrong. */
export type TeachVerdict = "good" | "skipped" | "confused";

/** The visual-diff colors — green = explained well, grey = skipped, red = wrong. */
export const VERDICT_COLOR: Record<TeachVerdict, string> = {
  good: STATE_COLOR.mastered,
  skipped: STATE_COLOR.unknown,
  confused: STATE_COLOR.gap,
};

export const VERDICT_LABEL: Record<TeachVerdict, string> = {
  good: "Explained well",
  skipped: "Skipped · hand-waved",
  confused: "Wrong · confused",
};

const VERDICT_LABEL_PT: Record<TeachVerdict, string> = {
  good: "Bem explicado",
  skipped: "Pulado · enrolado",
  confused: "Errado · confuso",
};

/** Language-aware Gap Report verdict label. */
export function verdictLabel(verdict: TeachVerdict, lang: Language = "en"): string {
  return (lang === "pt-BR" ? VERDICT_LABEL_PT : VERDICT_LABEL)[verdict];
}

/** A single-probe corrective for a gap — the targeted Socratic micro-pass. */
export interface TeachFixReply {
  label: string;
  correct: boolean;
  response: string;
}

/**
 * One sub-point of the concept — a *rubric* row, not a script.
 *
 * The learner is never shown these before they teach: the whole diagnostic
 * value of a teach-back is what they never think to mention, and a sub-point
 * printed above the input is the outline of the answer handed over before the
 * test. They teach the concept end to end in their own words; the judge diffs
 * that monologue against these rows.
 */
export interface FeynmanBeat {
  id: string;
  /** The sub-point being tested — the Gap Report row label. */
  subPoint: string;
  /** What a solid explanation has to convey for this row to count as taught.
   *  The judge's rubric — never a model monologue to grade similarity against. */
  mustConvey: string[];
  /** The targeted Socratic micro-pass "Fix this" opens on just this sub-point. */
  fix: { probe: string; replies: TeachFixReply[] };
  /** The red Gap sub-node this beat writes back to the map when left unresolved. */
  gap: GapSpec;
}

/** The scaffold offered when the learner freezes — never a blank wall. */
export const FEYNMAN_SCAFFOLD =
  "No blank-wall panic. Start with the simplest thing: what problem does this concept actually solve? Teach me that first — the rest pulls itself out.";

const FEYNMAN_SCAFFOLD_PT =
  "Sem pânico de tela em branco. Comece pelo mais simples: que problema esse conceito realmente resolve? Ensine-me isso primeiro — o resto sai sozinho.";

/** Language-aware freeze scaffold. */
export function feynmanScaffold(lang: Language = "en"): string {
  return lang === "pt-BR" ? FEYNMAN_SCAFFOLD_PT : FEYNMAN_SCAFFOLD;
}

/** The live state of one Feynman session — held by AtlasApp, read by the view. */
export interface FeynmanSession {
  nodeId: string;
  /** True once teaching has begun (past the opening prompt). */
  started: boolean;
  /** Whether the stuck-scaffold has been offered. */
  scaffolded: boolean;
  /** The learner's own explanation, as they taught it. */
  explanation: string;
  /** The naive student's reaction to the whole teach-back. */
  response: string;
  /** The reaction is still being written — see `SocraticTurn.pending`. */
  pending: boolean;
  /** Verdict per beat id, diffed out of the explanation (or closed by a fix). */
  verdicts: Record<string, TeachVerdict>;
  /** The learner's own words that earned a gap, per beat id — what the gap
   *  sub-node and the misconception roll-up quote back at them. */
  quotes: Record<string, string>;
  /** Terms they leaned on without ever unpacking — the Feynman rule, checked. */
  jargon: string[];
  /** The previous pass's verdicts, kept across "teach it again" so the second
   *  pass can show the delta — the one place the loop is visible working. */
  previous: Record<string, TeachVerdict> | null;
  /** True once the explanation has been judged — the Gap Report shows. */
  reported: boolean;
  /** A Fix-this micro-pass open on this beat id, or null. */
  fixing: string | null;
  /** Fix replies already caught in the open micro-pass. */
  fixRuledOut: string[];
  /** The naive student's latest reaction inside an open fix, or null. */
  fixReaction: string | null;
}

/** The most core probes a Socratic pass plans — one per move, and the estimate
 *  a streaming pass opens on before its own plan has arrived. A session needs a
 *  length before its last step lands, which is the only reason this is a
 *  constant at all; `socraticPlan` is the real, per-concept count. */
export const SOCRATIC_STEPS = 4;

/** The fewest core probes a concept can be worth. Two is the honest answer for
 *  a single-mechanism idea with one way to get it wrong: padding that out to
 *  four costs the learner two clicks and teaches nothing. The floor is low so a
 *  short concept can come back short. */
export const SOCRATIC_MIN_STEPS = 2;

/** Probes written past the core, spent one at a time by a learner who keeps
 *  needing help. Unspent, they cost nothing but the tokens that wrote them —
 *  which is why there is one, not a bank: most passes never spend it. */
export const SOCRATIC_SPARES = 1;

/** The longest a written pass can be — core plus spares. The validator's upper
 *  bound, and the ceiling a struggling learner can buy up to. */
export const SOCRATIC_MAX_STEPS = SOCRATIC_STEPS + SOCRATIC_SPARES;

/** The fewest steps a *written* pass can carry: the smallest core, plus its
 *  spare. The validator's lower bound (and `Job.shape`'s), which is about the
 *  written array rather than the plan — a pass that skipped its spare is short,
 *  even when its core count is legitimately small. */
export const SOCRATIC_MIN_WRITTEN = SOCRATIC_MIN_STEPS + SOCRATIC_SPARES;

/** How many probes a written pass *plans* to run: its core steps, with the
 *  spares held back. The count is the model's call — as many as the concept
 *  needs — so this reads it off the material instead of assuming four. */
export function socraticPlan(steps: SocraticStep[]): number {
  const core = steps.filter((s) => !s.spare).length;
  return core || steps.length || SOCRATIC_STEPS;
}

// ---- misconception memory (across nodes, across sessions) -----------------
// A `SocraticSession` is thrown away when its pass ends, and `socraticProgress`
// deliberately drops finished ones — so every wrong turn the tutor caught used
// to die with the session that caught it. This is the part worth keeping: what
// this learner gets wrong *everywhere*, so the tutor can name the pattern
// instead of meeting the same confusion cold every time.

/** One wrong idea this learner has hit, rolled up run-wide. */
export interface MisconceptionRecord {
  /** The wrong idea itself, short enough to say back to them. */
  label: string;
  /** The concept it was last caught under. */
  node: string;
  count: number;
}

/** The roll-up stays bounded — the tutor only ever reads the top few. */
const MISCONCEPTION_CAP = 24;

/** File a caught misconception, merging it into one this learner has hit before
 *  (case-insensitively) so a repeat becomes a count, not a second entry. */
export function recordMisconception(
  list: MisconceptionRecord[],
  label: string,
  node: string,
): MisconceptionRecord[] {
  const text = label.trim().slice(0, 120);
  if (!text) return list;
  const key = text.toLowerCase();
  const at = list.findIndex((m) => m.label.toLowerCase() === key);
  const next =
    at >= 0
      ? list.map((m, i) => (i === at ? { ...m, node, count: m.count + 1 } : m))
      : [...list, { label: text, node, count: 1 }];
  return next.length > MISCONCEPTION_CAP ? next.slice(-MISCONCEPTION_CAP) : next;
}

/** What the judge is told about this learner: the confusions they keep coming
 *  back to, worst first. Seen once is noise — it earns its name on the repeat,
 *  which is exactly when "you keep confusing X and Y" is a true thing to say. */
export function recurringMisconceptions(
  list: MisconceptionRecord[],
  limit = 3,
): string[] {
  return list
    .filter((m) => m.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((m) => `"${m.label}" — hit ${m.count}× (last under ${m.node})`);
}

/** The most sub-points a teach-back rubric runs to. The beats stream in one at
 *  a time and the judge diffs against whatever arrived, so this is the top of
 *  the range the prompt asks for, not a bound the session depends on. */
export const FEYNMAN_BEATS = 4;

/** How long a rubric may be. Two rows is a complete rubric for a concept that
 *  genuinely has two things to say — the count belongs to the material, and
 *  `FEYNMAN_GAP_OFFSETS` indexes modulo, so a short rubric still lays out.
 *  Mirrored by `validateFeynman` and by `Job.shape`, which uses it to decide
 *  whether a streamed rubric is complete enough to cache. */
export const FEYNMAN_BEAT_BOUNDS = { min: 2, max: FEYNMAN_BEATS } as const;

/** A fresh teach-back. `previous` carries a prior pass's verdicts when the
 *  learner is teaching it again, and is null on a first attempt. */
export function feynmanStart(
  nodeId: string,
  previous: Record<string, TeachVerdict> | null = null,
): FeynmanSession {
  return {
    nodeId,
    started: false,
    scaffolded: false,
    explanation: "",
    response: "",
    pending: false,
    verdicts: {},
    quotes: {},
    jargon: [],
    previous,
    reported: false,
    fixing: null,
    fixRuledOut: [],
    fixReaction: null,
  };
}

export type FeynmanAction =
  | { type: "begin" }
  | { type: "scaffold" }
  /** The learner's whole explanation, already diffed server-side into a verdict
   *  per sub-point, the words that earned each gap, and any unpacked jargon. */
  | {
      type: "taught";
      text: string;
      verdicts: Record<string, TeachVerdict>;
      quotes?: Record<string, string>;
      jargon?: string[];
      response: string;
      /** True when only the verdicts have arrived — `stream` fills the wording. */
      pending?: boolean;
    }
  /** The naive student's reaction as it is written. */
  | { type: "stream"; text: string; pending?: boolean }
  | { type: "openFix"; beatId: string }
  | { type: "closeFix" }
  | { type: "fix"; index: number }
  | { type: "teachAgain" };

/**
 * The naive-student engine, as a pure transition. The learner teaches the whole
 * concept in their own words with nothing prompting them → the judge diffs it
 * against the rubric → the Gap Report opens. "Fix this" runs a one-probe
 * corrective that flips a gap to good, and "Teach again" resets for a fresh
 * pass while keeping the last one's verdicts for the delta.
 */
export function feynmanReducer(
  session: FeynmanSession,
  action: FeynmanAction,
  beats: FeynmanBeat[],
): FeynmanSession {
  switch (action.type) {
    case "begin":
      return { ...session, started: true };
    case "scaffold":
      // The freeze-scaffold: reveal the "start with the problem" nudge and drop
      // the learner straight onto the blank page.
      return { ...session, started: true, scaffolded: true };
    case "stream":
      // Gated on `reported`, not `pending`: a late frame from a pass the
      // learner has already reset must not land, but a session settled early
      // — the judge stream failed and its retry is filling the reaction in
      // behind an open Gap Report — still has to be writable.
      if (!session.reported) return session;
      return { ...session, response: action.text, pending: !!action.pending };
    case "taught": {
      if (session.reported) return session;
      return {
        ...session,
        started: true,
        reported: true,
        explanation: action.text,
        response: action.response,
        pending: !!action.pending,
        // A sub-point the judge never ruled on was never taught: silence is a
        // skip, not a pass. Anything else would grade an unmentioned row good.
        verdicts: Object.fromEntries(
          beats.map((b) => [b.id, action.verdicts[b.id] ?? "skipped"]),
        ),
        quotes: action.quotes ?? {},
        jargon: action.jargon ?? [],
      };
    }
    case "openFix":
      return {
        ...session,
        fixing: action.beatId,
        fixRuledOut: [],
        fixReaction: null,
      };
    case "closeFix":
      return { ...session, fixing: null, fixRuledOut: [], fixReaction: null };
    case "fix": {
      if (!session.fixing) return session;
      const beat = beats.find((b) => b.id === session.fixing);
      const reply = beat?.fix.replies[action.index];
      if (!reply || session.fixRuledOut.includes(reply.label)) return session;
      if (reply.correct) {
        // Gap closed: the sub-point flips to good and won't write back.
        return {
          ...session,
          verdicts: { ...session.verdicts, [beat!.id]: "good" },
          fixing: null,
          fixRuledOut: [],
          fixReaction: null,
        };
      }
      // Caught: surface the correction, rule the wrong answer out, keep trying.
      return {
        ...session,
        fixReaction: reply.response,
        fixRuledOut: [...session.fixRuledOut, reply.label],
      };
    }
    case "teachAgain":
      return {
        ...feynmanStart(session.nodeId, session.verdicts),
        started: true,
        scaffolded: session.scaffolded,
      };
    default:
      return session;
  }
}

/** Beats still red or grey — the gaps that write back to the map as sub-nodes.
 *  Each carries the learner's own words when the judge caught them, so the
 *  Socratic pass the gap opens starts from what they actually said rather than
 *  from a reason written before they said anything. */
export function feynmanGaps(session: FeynmanSession, beats: FeynmanBeat[]): GapSpec[] {
  return beats
    .filter(
      (b) =>
        session.verdicts[b.id] === "skipped" || session.verdicts[b.id] === "confused",
    )
    .map((b) => {
      const quote = session.quotes[b.id]?.trim();
      return quote
        ? { ...b.gap, reason: `You said: "${quote}" — ${b.gap.reason}` }
        : b.gap;
    });
}

/** A clean-enough diff: every sub-point explained well, nothing wrong or skipped. */
export function feynmanClean(session: FeynmanSession, beats: FeynmanBeat[]): boolean {
  return beats.every((b) => session.verdicts[b.id] === "good");
}

/** How many gaps a pass ended with — the number the second-pass delta compares. */
export function feynmanGapCount(
  verdicts: Record<string, TeachVerdict>,
  beats: FeynmanBeat[],
): number {
  return beats.filter((b) => {
    const v = verdicts[b.id];
    return v === "skipped" || v === "confused";
  }).length;
}
