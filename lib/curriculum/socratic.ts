// ---- Phase 3a · Socratic (during learning) --------------------------------
// The learner *constructs* the idea through guided questioning. The AI is
// contingent (hint when near, teach when lost), and — the single most
// important behavior — anti-sycophantic: it catches wrong reasoning and
// surfaces it gently, never smoothing it over.
//
// The pass is a ladder the tutor walks *down*, not a gate the learner has to
// open. A step starts at the learner's chosen floor and descends a rung each
// time a turn adds nothing; the bottom rung teaches outright and closes. So a
// step always ends, in a bounded number of turns, and the learner never has to
// press a button that says they gave up — the tutor lands it. The rung a step
// closed on *is* the measurement, which is why `stepAssisted` no longer
// exists: a caught error costs a rung, and the rung already remembers.
//
// Scaffolding still fades, but per step rather than per pass: every probe
// reopens at the floor, so help spent on a hard step is not carried into the
// next one as a permanent demotion.
import {
  bank,
  clampHelp,
  DESCENT,
  resolutionFor,
  restored,
  type HelpLevel,
  type ReplyQuality,
  type StepResolution,
} from "./socraticLadder";
import { Language } from "@/lib/i18n";

export * from "./socraticLadder";

/** The classic Socratic moves, tagged on each probe so the intent is legible. */
export type SocraticMove =
  | "Clarify"
  | "Challenge the assumption"
  | "Probe the reasoning"
  | "Probe the implications";

export interface SocraticReply {
  label: string;
  quality: ReplyQuality;
  /** The AI's honest, contingent response to this reply. */
  response: string;
}

export interface SocraticStep {
  id: string;
  move: SocraticMove;
  /** The probing question the AI opens the step with. */
  prompt: string;
  /** Anticipated learner replies. Never rendered as buttons on either client —
   *  this is the bank of misconceptions the judge is handed, so it can catch
   *  one by name instead of generically. */
  replies: SocraticReply[];
  /** What *this probe* needs to hear, as separable pieces: the bar the judge
   *  grades against, and the ledger the learner watches fill in. The judge used
   *  to be handed `tell` — a complete exposition — as "what a fully correct
   *  answer would convey", and a one-sentence reply diffed against a teaching
   *  paragraph comes back "near" almost every time, which was the largest
   *  single source of steps that would not close. Optional: passes cached
   *  before it existed fall back to `tell` rather than breaking. */
  sufficient?: string[];
  /** Raised-help scaffold ("I'm stuck") — a nudge that doesn't give it away. */
  hint: string;
  /** Direct instruction for the bottom rung — drops the Socratic act entirely. */
  tell: string;
  /** A held-back probe. The pass plans its core steps (`socraticPlan`) and only
   *  reaches for these when weak understanding buys one — so the length of a
   *  pass follows the learner, not a constant. */
  spare?: boolean;
}

/** One line of the Socratic transcript. */
export interface SocraticTurn {
  role: "ai" | "learner";
  text: string;
  /** Present on AI probes: the Socratic move being made. */
  move?: SocraticMove;
  /** Colors the AI bubble: a caught error, an affirmation, or direct teaching. */
  tone?: "neutral" | "catch" | "affirm" | "teach";
  /** The verdict landed but its wording is still being written (the judge
   *  streams the two separately). The view shows the bubble as still-writing;
   *  `stream` fills it in. At most one turn is pending at a time. */
  pending?: boolean;
  /** The judge never answered, so this bubble has nothing in it and never
   *  will — see `rewriteOpen`. The view renders a retry in its place. */
  failed?: boolean;
}

/** The live state of one Socratic session — held by AtlasApp, read by the view. */
export interface SocraticSession {
  nodeId: string;
  step: number;
  /** The rung the step on screen is currently at. Reopens at `floor`. */
  help: HelpLevel;
  /** The rung every step opens on — the dial, set by the learner. It only ever
   *  raises the live rung: help already given cannot be taken back, so lowering
   *  it mid-step takes effect on the next probe. It is an honest trade rather
   *  than a free win — opening at Guide caps the step at "hint". */
  floor: HelpLevel;
  log: SocraticTurn[];
  /** The step on screen's own bar, snapshotted when it opened — the same move
   *  the transcript already makes with each probe's prompt, and what lets a
   *  resumed pass redraw its ledger without re-reading the steps. */
  bar: string[];
  /** Which `sufficient` pieces the learner's answers have banked on the step
   *  in progress, by index. The ledger on screen, and what turns a run of
   *  partial answers into one complete one. Resets per step. */
  covered: number[];
  /** "Show me this one" uses — repeated use flags a prerequisite gap. */
  tells: number;
  /** How every *finished* step resolved, oldest first — the record `socraticOutcome`
   *  reads to decide whether the pass earned an unqualified "understood". */
  resolutions: StepResolution[];
  /**
   * How many steps this session will run. Held explicitly rather than read off
   * `steps.length`, because the steps stream in one at a time: deriving the
   * last step from the array would end the session as soon as the learner
   * answered step 1, while steps 2-4 were still being written.
   */
  total: number;
  /** True when the next step exists in the plan but hasn't been written yet.
   *  The view shows that it's coming; `hydrate` clears it when it lands. */
  awaitingNext: boolean;
  done: boolean;
}

/** Push a step's opening probe onto the log and reset the per-step gates.
 *  A step that hasn't streamed in yet parks the session instead of throwing. */
function openStep(
  session: SocraticSession,
  step: number,
  steps: SocraticStep[],
): SocraticSession {
  const s = steps[step];
  const fresh = {
    ...session,
    step,
    help: session.floor,
    covered: [],
    bar: s?.sufficient ?? [],
  };
  if (!s) return { ...fresh, awaitingNext: true };
  return {
    ...fresh,
    awaitingNext: false,
    log: [...session.log, { role: "ai", text: s.prompt, move: s.move }],
  };
}

/** A fresh session, opened on its first probe. Starts at the top of the ladder:
 *  a probe the learner has not seen yet has had no scaffolding spent on it, and
 *  opening anywhere below Silent would put `unaided` out of reach by default.
 *  `total` is the number of steps the pass *plans* to run: more than has
 *  arrived when it opens on a stream, and fewer than are written when the pass
 *  came with spares (`socraticPlan`) for a struggling learner to buy. */
export function socraticStart(
  nodeId: string,
  steps: SocraticStep[],
  total = steps.length,
): SocraticSession {
  const first = steps[0];
  return {
    nodeId,
    step: 0,
    help: 0,
    floor: 0,
    covered: [],
    bar: first?.sufficient ?? [],
    tells: 0,
    resolutions: [],
    total: Math.max(1, total),
    awaitingNext: !first,
    done: false,
    log: first ? [{ role: "ai", text: first.prompt, move: first.move }] : [],
  };
}

const STUCK_TEXT: Record<Language, string> = {
  en: "I'm stuck — more help.",
  "pt-BR": "Estou travado — mais ajuda.",
};
const TELL_TEXT: Record<Language, string> = {
  en: "Show me this one.",
  "pt-BR": "Mostre-me esta.",
};

const REPLY_TONE: Record<ReplyQuality, SocraticTurn["tone"]> = {
  correct: "affirm",
  partial: "affirm",
  near: "neutral",
  wrong: "catch",
  lost: "teach",
};

export type SocraticAction =
  /** The learner just sent their answer — it joins the transcript at once and
   *  the tutor's bubble opens still-writing beside it, ahead of the verdict. */
  | { type: "answer"; text: string }
  | { type: "stuck" }
  | { type: "tell" }
  /** The scaffolding dial. Sets the floor every later step opens on, and
   *  raises the live rung if it is below the new floor. */
  | { type: "setHelp"; level: HelpLevel }
  /** A free-text answer, already judged server-side. `response` may be empty
   *  when only the verdict has streamed in — mark it `pending` and send
   *  `stream` with the wording when it lands. `covered` is the judge's reading
   *  of which `sufficient` pieces the answers so far have banked. */
  | {
      type: "judged";
      answer: string;
      quality: ReplyQuality;
      response: string;
      covered?: number[];
      pending?: boolean;
    }
  /** The judge's wording for the turn currently marked pending. `pending` stays
   *  true for the token-by-token drafts, so every later draft still finds the
   *  turn it is filling; the final one clears it. */
  | { type: "stream"; text: string; pending?: boolean }
  /** The judge call for the pending turn failed. Clears `pending` so the bubble
   *  stops claiming to be writing, and flags it so the view can offer a retry
   *  instead of an empty reply. */
  | { type: "judgeFailed" }
  /** Put the failed bubble back to writing for a second judge attempt. The
   *  learner's answer is already in the transcript, so a retry must re-open the
   *  existing turn rather than send a second one. */
  | { type: "retryJudge" }
  /** More steps have streamed in — open the one the session is parked on.
   *  `total` re-caps the pass when a stream ended short of the plan. */
  | { type: "hydrate"; total?: number };

const pending = (t: SocraticTurn) => !!t.pending;

/** The three transitions on the still-writing bubble are one walk: find the
 *  open turn and rewrite it, or leave the session alone when there isn't one.
 *  `stream` fills it in as the wording arrives, `judgeFailed` marks it dead
 *  (the failure is never written *into* the bubble — that put "OpenRouter 502"
 *  on screen in the tutor's own voice), and `retryJudge` reopens it so a second
 *  attempt refills the turn already in the transcript instead of sending the
 *  learner's answer twice. */
function rewriteOpen(
  session: SocraticSession,
  find: (t: SocraticTurn) => boolean,
  patch: (t: SocraticTurn) => SocraticTurn,
): SocraticSession {
  if (!session.log.some(find)) return session;
  return { ...session, log: session.log.map((t) => (find(t) ? patch(t) : t)) };
}

/**
 * The contingent tutor, as a pure transition.
 *
 * Every path here ends a step in a bounded number of turns: correct closes on
 * the rung it was reached at, partial banks ground and holds, anything else
 * descends. The bottom rung is not a state the learner sits in — the tutor
 * teaches and closes — which is what makes "stuck here forever" unreachable
 * rather than merely unlikely. The anti-sycophancy lives here too: a wrong
 * reply is surfaced and costs a rung, never advanced past in silence.
 */
export function socraticReducer(
  saved: SocraticSession,
  action: SocraticAction,
  steps: SocraticStep[],
  lang: Language = "en",
): SocraticSession {
  const session = restored(saved, steps);
  // Placed before the `done` guard on purpose: the verdict that finished the
  // session is exactly the one whose wording is still arriving, and the turn
  // that failed may well be the one that would have finished it.
  if (action.type === "stream")
    return rewriteOpen(session, pending, (t) => ({
      ...t,
      text: action.text,
      pending: action.pending ? true : undefined,
    }));
  if (action.type === "judgeFailed")
    return rewriteOpen(session, pending, (t) => ({
      ...t,
      pending: undefined,
      failed: true,
    }));
  if (action.type === "retryJudge")
    return rewriteOpen(
      session,
      (t) => !!t.failed,
      (t) => ({
        ...t,
        failed: undefined,
        pending: true,
      }),
    );
  // The dial is a control, not a verdict — it works even on a finished pass.
  if (action.type === "setHelp") {
    const floor = clampHelp(action.level);
    return { ...session, floor, help: clampHelp(Math.max(session.help, floor)) };
  }
  if (session.done) return session;

  // More steps arrived. Re-cap the pass if the stream ended short of the plan,
  // then open the step the session is parked on — or finish, if that step was
  // the one that never came.
  if (action.type === "hydrate") {
    // With no steps in hand yet (a resumed session reopening on an empty
    // stream) there is no real evidence the plan came up short — trust the
    // requested/saved total instead of clamping it down to `step + 1`.
    // `action.total` is a cap, not a set: it closes a pass whose stream came up
    // short, but never overrides probes the session bought on the way — the
    // written spares run past the plan on purpose.
    const planned = Math.min(session.total, action.total ?? Infinity);
    const total = steps.length
      ? Math.max(1, Math.min(planned, Math.max(steps.length, session.step + 1)))
      : Math.max(1, planned);
    const capped = { ...session, total };
    if (!capped.awaitingNext) return capped;
    if (capped.step >= total) return { ...capped, awaitingNext: false, done: true };
    return openStep(capped, capped.step, steps);
  }

  const step = steps[session.step];
  // Nothing to act on until the parked step lands.
  if (!step) return session;

  // Advancing earns the ending: three unaided answers running end the pass
  // early (#D); two straight assisted ones buy another probe out of the spares
  // — again and again, while spares last — otherwise it runs to `total`.
  const advance = (
    base: SocraticSession,
    resolution: StepResolution,
  ): SocraticSession => {
    const resolutions = [...base.resolutions, resolution];
    let total = base.total;
    if (
      resolutions.length >= 3 &&
      total > resolutions.length &&
      resolutions.slice(-3).every((r) => r === "unaided")
    ) {
      total = resolutions.length;
    }
    // Weak understanding buys probes — one per two assisted steps running, for
    // as long as the plan wrote spares to spend. Not the single spare slot
    // `steps.length` used to allow: a learner still working at it keeps
    // earning questions.
    //
    // Two told-outright steps running buy nothing. That learner isn't
    // reasoning their way anywhere and more probes would only be more to click
    // through; `socraticOutcome` flags them back to the reading instead.
    const recent = resolutions.slice(-2);
    if (
      resolutions.length >= 2 &&
      total < steps.length &&
      recent.every((r) => r !== "unaided") &&
      recent.some((r) => r === "hint")
    ) {
      total += 1;
    }
    const finished = session.step >= total - 1;
    const next = { ...base, resolutions, total };
    return finished ? { ...next, done: true } : openStep(next, session.step + 1, steps);
  };

  /** Drop to the bottom rung: say the whole thing and close the step — the one
   *  place the Socratic act is dropped outright. */
  const teach = (base: SocraticSession): SocraticSession =>
    advance(
      {
        ...base,
        help: 3,
        log: [...base.log, { role: "ai", text: step.tell, tone: "teach" }],
      },
      "told",
    );

  switch (action.type) {
    case "stuck": {
      // Asking for help costs a rung, the same as stalling into one — and at
      // the bottom it is the cue to finish the step, not to hand over one more
      // nudge nobody can act on.
      const rung = clampHelp(session.help + 1);
      const asked: SocraticSession = {
        ...session,
        log: [...session.log, { role: "learner", text: STUCK_TEXT[lang] }],
      };
      if (rung >= 3) return teach(asked);
      return {
        ...asked,
        help: rung,
        log: [...asked.log, { role: "ai", text: step.hint, tone: "teach" }],
      };
    }
    case "tell": {
      // The bottom rung reached by hand rather than by stalling into it — same
      // move, same cost, so there is no separate currency for giving up.
      return teach({
        ...session,
        tells: session.tells + 1,
        log: [...session.log, { role: "learner", text: TELL_TEXT[lang] }],
      });
    }
    case "answer": {
      if (session.log.some((t) => t.pending)) return session;
      return {
        ...session,
        log: [
          ...session.log,
          { role: "learner", text: action.text },
          { role: "ai", text: "", pending: true },
        ],
      };
    }
    case "judged": {
      // The contingent tutor on the learner's own words: the server judge
      // classified the free-text answer against everything said on this step.
      const bubble: SocraticTurn = {
        role: "ai",
        text: action.response,
        tone: REPLY_TONE[action.quality],
        ...(action.pending ? { pending: true } : null),
      };
      // `answer` already opened the pair — the verdict fills that bubble
      // rather than logging the answer a second time.
      const open = session.log.findIndex((t) => t.pending);
      const logged: SocraticSession = {
        ...session,
        covered: bank(session.covered, action.covered),
        log:
          open >= 0
            ? session.log.map((t, i) => (i === open ? bubble : t))
            : [...session.log, { role: "learner", text: action.answer }, bubble],
      };
      // Closed on the rung it was reached at — never on the rung a descent
      // would have moved to, because no descent happened.
      if (action.quality === "correct")
        return advance(logged, resolutionFor(session.help));
      const rung = clampHelp(session.help + DESCENT[action.quality]);
      // The bottom rung is terminal. Landing on it means the tutor says the
      // whole thing now instead of asking a fifth time.
      if (rung >= 3) return teach(logged);
      return { ...logged, help: rung };
    }
    default:
      return session;
  }
}

/** Overall verdict for a finished pass — earns the "understood" hand-off,
 *  a softer "assisted" one, or flags that it wasn't earned at all (#C).
 *  A gap pass closes only on a clean `told === 0` — hint-assisted still
 *  counts as reconstructed, told outright does not. */
export type SocraticOutcome = "unaided" | "assisted" | "flagged";

export function socraticOutcome(session: SocraticSession, gap: boolean): SocraticOutcome {
  const told = session.resolutions.filter((r) => r === "told").length;
  if (gap) return told === 0 ? "unaided" : "flagged";
  if (told >= 2) return "flagged";
  return session.resolutions.every((r) => r === "unaided") ? "unaided" : "assisted";
}
