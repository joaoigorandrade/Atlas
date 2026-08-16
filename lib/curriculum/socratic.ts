// ---- Phase 3a · Socratic (during learning) --------------------------------
// The learner *constructs* the idea through guided questioning. The AI is
// contingent (hint when near, teach when lost), and — the single most
// important behavior — anti-sycophantic: it catches wrong reasoning and
// surfaces it gently, never smoothing it over. Scaffolding fades as the
// learner answers unaided. Content ships the Linear Transformations pass so
// the probe → reply → catch → advance mechanic is real.
import { STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

/** The scaffolding dial, least help → most. Falls toward Silent with mastery. */
export const HELP_LABELS = ["Silent", "Hint", "Guide", "Show me"] as const;
export type HelpLevel = 0 | 1 | 2 | 3;

const HELP_LABELS_PT = ["Silencioso", "Dica", "Guiar", "Mostre-me"] as const;

/** Language-aware scaffolding-dial labels. */
export function helpLabels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? HELP_LABELS_PT : HELP_LABELS;
}

/** Warmer = more help. The dial and its active cell read this. */
export const HELP_COLOR: Record<HelpLevel, string> = {
  0: STATE_COLOR.mastered, // Silent — the learner is carrying it
  1: STATE_COLOR.learning, // Hint
  2: STATE_COLOR.frontier, // Guide
  3: STATE_COLOR.shaky, // Show me — dropped to direct instruction
};

/** The classic Socratic moves, tagged on each probe so the intent is legible. */
export type SocraticMove =
  | "Clarify"
  | "Challenge the assumption"
  | "Probe the reasoning"
  | "Probe the implications";

/**
 * How true a reply is. `correct` advances; `near` earns a hint and another
 * try; `wrong` gets caught (anti-sycophancy); `lost` drops the act and teaches.
 */
export type ReplyQuality = "correct" | "near" | "wrong" | "lost";

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
  replies: SocraticReply[];
  /** Raised-help scaffold ("I'm stuck") — a nudge that doesn't give it away. */
  hint: string;
  /** Direct instruction for "Just tell me" — drops the Socratic act entirely. */
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
  /**
   * The judge never answered, so this bubble has nothing in it and never will.
   *
   * It exists because the alternative was worse: the failure used to be written
   * *into* the bubble as `text`, which put "OpenRouter 502" on screen in the
   * tutor's own voice, as though the tutor had said it. A turn that failed is
   * marked, not spoken — the view renders a retry in its place.
   */
  failed?: boolean;
}

/** How a finished step was resolved — earns the ending differently. */
export type StepResolution = "unaided" | "hint" | "told";

/** The live state of one Socratic session — held by AtlasApp, read by the view. */
export interface SocraticSession {
  nodeId: string;
  step: number;
  help: HelpLevel;
  log: SocraticTurn[];
  /** Reply labels already ruled out on this step (caught wrong / spent hints). */
  ruledOut: string[];
  /** "Just tell me" uses — repeated use flags a prerequisite gap. */
  tells: number;
  /** How every *finished* step resolved, oldest first — the record `socraticOutcome`
   *  reads to decide whether the pass earned an unqualified "understood". */
  resolutions: StepResolution[];
  /** Any scaffolding spent on the step in progress (stuck, a caught near/wrong) —
   *  turns an eventual correct into "hint" instead of "unaided". Resets per step. */
  stepAssisted: boolean;
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

/** Clamp a help level into the dial's range. */
function clampHelp(n: number): HelpLevel {
  return Math.max(0, Math.min(3, n)) as HelpLevel;
}

/** Push a step's opening probe onto the log and reset the per-step gates.
 *  A step that hasn't streamed in yet parks the session instead of throwing. */
function openStep(
  session: SocraticSession,
  step: number,
  steps: SocraticStep[],
): SocraticSession {
  const s = steps[step];
  if (!s)
    return {
      ...session,
      step,
      ruledOut: [],
      stepAssisted: false,
      awaitingNext: true,
    };
  return {
    ...session,
    step,
    ruledOut: [],
    stepAssisted: false,
    awaitingNext: false,
    log: [...session.log, { role: "ai", text: s.prompt, move: s.move }],
  };
}

/** A fresh session, opened on its first probe. Starts mid-dial, at Hint.
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
    help: 1,
    ruledOut: [],
    tells: 0,
    resolutions: [],
    stepAssisted: false,
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
  en: "Just tell me.",
  "pt-BR": "Só me conte.",
};

const REPLY_TONE: Record<ReplyQuality, SocraticTurn["tone"]> = {
  correct: "affirm",
  near: "neutral",
  wrong: "catch",
  lost: "teach",
};

export type SocraticAction =
  | { type: "reply"; index: number }
  | { type: "stuck" }
  | { type: "tell" }
  /** The scaffolding dial, set by hand rather than only fading with mastery (#B). */
  | { type: "setHelp"; level: HelpLevel }
  /** The learner just sent their answer — it joins the transcript at once and
   *  the tutor's bubble opens still-writing beside it, ahead of the verdict. */
  | { type: "answer"; text: string }
  /** A free-text answer, already judged server-side (#25). `response` may be
   *  empty when only the verdict has streamed in — mark it `pending` and send
   *  `stream` with the wording when it lands. */
  | {
      type: "judged";
      answer: string;
      quality: ReplyQuality;
      response: string;
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

/**
 * The contingent tutor, as a pure transition. Correct answers advance and let
 * scaffolding fade; near answers earn a hint and another try; wrong answers get
 * caught and raise help; "lost"/"just tell me" drop the act and teach. This is
 * where the anti-sycophancy lives — a wrong reply is surfaced, never advanced.
 */
export function socraticReducer(
  session: SocraticSession,
  action: SocraticAction,
  steps: SocraticStep[],
  lang: Language = "en",
): SocraticSession {
  // Before the `done` guard on purpose: the verdict that finished the session
  // is exactly the one whose wording is still arriving.
  if (action.type === "stream") {
    if (!session.log.some((t) => t.pending)) return session;
    return {
      ...session,
      log: session.log.map((t) =>
        t.pending
          ? {
              ...t,
              text: action.text,
              pending: action.pending ? true : undefined,
            }
          : t,
      ),
    };
  }
  // Same placement rationale as `stream`: the turn that failed may well be the
  // one that would have finished the session.
  if (action.type === "judgeFailed") {
    if (!session.log.some((t) => t.pending)) return session;
    return {
      ...session,
      log: session.log.map((t) =>
        t.pending ? { ...t, pending: undefined, failed: true } : t,
      ),
    };
  }
  if (action.type === "retryJudge") {
    if (!session.log.some((t) => t.failed)) return session;
    return {
      ...session,
      log: session.log.map((t) =>
        t.failed ? { ...t, failed: undefined, pending: true } : t,
      ),
    };
  }
  // The dial is a control, not a verdict — it works even on a finished pass.
  if (action.type === "setHelp") {
    return { ...session, help: clampHelp(action.level) };
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

  switch (action.type) {
    case "stuck": {
      return {
        ...session,
        help: clampHelp(session.help + 1),
        stepAssisted: true,
        ruledOut: [...session.ruledOut],
        log: [
          ...session.log,
          { role: "learner", text: STUCK_TEXT[lang] },
          { role: "ai", text: step.hint, tone: "teach" },
        ],
      };
    }
    case "tell": {
      const base: SocraticSession = {
        ...session,
        help: 3,
        tells: session.tells + 1,
        log: [
          ...session.log,
          { role: "learner", text: TELL_TEXT[lang] },
          { role: "ai", text: step.tell, tone: "teach" },
        ],
      };
      return advance(base, "told");
    }
    case "reply": {
      const reply = step.replies[action.index];
      if (!reply || session.ruledOut.includes(reply.label)) return session;
      const logged: SocraticSession = {
        ...session,
        log: [
          ...session.log,
          { role: "learner", text: reply.label },
          { role: "ai", text: reply.response, tone: REPLY_TONE[reply.quality] },
        ],
      };
      if (reply.quality === "correct" || reply.quality === "lost") {
        // Correct fades the scaffolding; a "lost" reply was just taught, so
        // help ticks up before we move on.
        const help =
          reply.quality === "correct"
            ? clampHelp(session.help - 1)
            : clampHelp(session.help + 1);
        const resolution: StepResolution =
          reply.quality === "correct"
            ? session.stepAssisted
              ? "hint"
              : "unaided"
            : "told";
        return advance({ ...logged, help }, resolution);
      }
      // near → hint and let them try again; wrong → caught, help rises. Both
      // rule the reply out so the learner converges instead of re-picking it.
      return {
        ...logged,
        help: reply.quality === "wrong" ? clampHelp(session.help + 1) : session.help,
        stepAssisted: true,
        ruledOut: [...session.ruledOut, reply.label],
      };
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
      // classified the free-text answer; the same advance/help rules apply.
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
        log:
          open >= 0
            ? session.log.map((t, i) => (i === open ? bubble : t))
            : [...session.log, { role: "learner", text: action.answer }, bubble],
      };
      if (action.quality === "correct" || action.quality === "lost") {
        const help =
          action.quality === "correct"
            ? clampHelp(session.help - 1)
            : clampHelp(session.help + 1);
        const resolution: StepResolution =
          action.quality === "correct"
            ? session.stepAssisted
              ? "hint"
              : "unaided"
            : "told";
        return advance({ ...logged, help }, resolution);
      }
      return {
        ...logged,
        help: action.quality === "wrong" ? clampHelp(session.help + 1) : session.help,
        stepAssisted: true,
      };
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
