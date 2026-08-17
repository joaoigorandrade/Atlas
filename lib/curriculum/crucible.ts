// ---- Phase 5 · Crucible (application / transfer) — the depth engine --------
// Force the knowledge into a *novel* context it wasn't taught in — the truest
// signal of mastery, far better than card recall. A confidence prompt comes
// first (the calibration hook), then a problem generated to sit at the edge of
// the learner's ability, escalating up a difficulty ladder (deliberate
// practice). Feedback is specific: not right/wrong but *which sub-concept*
// transferred and which didn't. A failure is diagnostically rich — it names the
// sub-concept that didn't transfer, writes it to the map as a red Gap node and
// flips the parent Shaky, then offers a 30-second Socratic re-explanation before
// a recalibrated re-attempt one rung down. Only Crucible success (plus
// retention) grants green. Content ships the Linear Transformations transfer
// problem — a type-designer shear the learner was never handed — so the
// confidence → attempt → diagnostic → re-attempt loop is real, not decorative.
import { GapSpec } from "./replan";
import { STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

/** The Crucible's deep-rust palette (its accent everywhere it appears). */
export const CRUCIBLE_COLOR = {
  accent: "#a23b34",
  soft: "rgba(162,59,52,0.08)",
  border: "rgba(162,59,52,0.28)",
  glow: "rgba(162,59,52,0.24)",
} as const;

/** The stated-confidence levels captured before the problem is revealed. */
export const CONFIDENCE_LEVELS = [
  "Not sure",
  "Fairly confident",
  "Very confident",
] as const;
export type ConfidenceLevel = 0 | 1 | 2;

const CONFIDENCE_LEVELS_PT = [
  "Não tenho certeza",
  "Bastante confiante",
  "Muito confiante",
] as const;

/** Language-aware pre-problem confidence levels. */
export function confidenceLevels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? CONFIDENCE_LEVELS_PT : CONFIDENCE_LEVELS;
}

/** One rung of the escalating difficulty ladder (deliberate practice). */
export interface CrucibleRung {
  label: string;
}

/** A transfer-diagnostic verdict: a sub-concept that carried over, or didn't. */
export type TransferVerdict = "good" | "red";

/** The visual-diff colors — green = transferred, red = didn't carry over. */
export const TRANSFER_COLOR: Record<TransferVerdict, string> = {
  good: STATE_COLOR.mastered,
  red: STATE_COLOR.gap,
};

/** One row of the transfer diagnostic — which sub-concept moved to the new frame. */
export interface TransferRow {
  verdict: TransferVerdict;
  text: string;
}

/** One problem on the ladder — a framing the learner was never handed. */
export interface CrucibleProblem {
  /** The rung label + framing note shown as a pill above the problem. */
  tag: string;
  q: string;
  /** A nudge that reframes without giving it away (contingent difficulty). */
  hint: string;
  placeholder: string;
  /** A pre-written attempt the learner can drop in (a demo affordance). */
  sample: string;
}

/** Everything the Crucible surface needs for one node's transfer pass. */
export interface CrucibleContent {
  centerId: string;
  centerLabel: string;
  /** Mastered nodes the problem interleaves — retrieval isn't blocked on one idea. */
  draws: string[];
  /** The escalating difficulty ladder shown in the sidebar. */
  rungs: CrucibleRung[];
  /** The precise sub-concept a first-attempt failure writes back to the map. */
  gap: GapSpec;
  /** The problem per rung — [0] the novel transfer, [1] the scaffolded re-attempt. */
  problems: CrucibleProblem[];
  /** The transfer diagnostic shown on submission (what carried over, what didn't). */
  transfer: TransferRow[];
  /** The 30-second Socratic re-explanation aimed straight at the gap. */
  reExplain: string;
}

/** The two stages of a Crucible attempt: state confidence, then work. */
export type CrucibleStage = "confidence" | "work";
/** A submission's result: a first-rung failure, or a transferred re-attempt. */
export type CrucibleOutcome = "partial" | "pass";

/** The live state of one Crucible session — held by AtlasApp, read by the view. */
export interface CrucibleSession {
  nodeId: string;
  stage: CrucibleStage;
  /** Stated confidence before the problem is revealed (the calibration hook). */
  conf: ConfidenceLevel | null;
  /** Current rung of the ladder (0 = novel transfer, 1 = scaffolded re-attempt). */
  rung: number;
  attempt: string;
  submitted: boolean;
  outcome: CrucibleOutcome | null;
  /** The judged transfer diagnostic for THIS attempt (#27) — grounded in what
   *  the learner actually wrote; null until judged. */
  transfer: TransferRow[] | null;
  /** Whether the 30-second Socratic re-explanation is expanded. */
  reExplain: boolean;
}

export function crucibleStart(nodeId: string): CrucibleSession {
  return {
    nodeId,
    stage: "confidence",
    conf: null,
    rung: 0,
    attempt: "",
    submitted: false,
    outcome: null,
    transfer: null,
    reExplain: false,
  };
}

export type CrucibleAction =
  | { type: "confidence"; level: ConfidenceLevel }
  | { type: "attempt"; value: string }
  | { type: "sample" }
  /** The server judge's grading of the actual attempt (#27). `transfer` may be
   *  empty when only the pass/partial verdict has streamed in. */
  | { type: "result"; outcome: CrucibleOutcome; transfer: TransferRow[] }
  /** The diagnostic rows for an already-graded attempt, arriving behind their
   *  verdict. Ignored unless the attempt is submitted, so it can never grade. */
  | { type: "transfer"; transfer: TransferRow[] }
  | { type: "toggleReExplain" }
  | { type: "retry" };

/**
 * The transfer engine, as a pure transition. Stating confidence opens the
 * workspace; the learner attempts, then submits. The first rung fails
 * precisely — the caller writes the named sub-concept back to the map as a red
 * Gap node — and a re-attempt one rung down transfers. The write-back itself
 * (spawning/removing the gap node, flipping mastery) lives in AtlasApp; this
 * reducer only owns the session.
 */
export function crucibleReducer(
  session: CrucibleSession,
  action: CrucibleAction,
  content: CrucibleContent,
): CrucibleSession {
  switch (action.type) {
    case "confidence":
      return { ...session, conf: action.level, stage: "work" };
    case "attempt":
      return { ...session, attempt: action.value };
    case "sample": {
      const prob = crucibleProblem(session, content);
      return prob ? { ...session, attempt: prob.sample } : session;
    }
    case "result":
      // The judge graded the real attempt — pass/partial is earned, not
      // scripted, and the diagnostic rows are grounded in what was written.
      if (session.submitted || !session.attempt.trim()) return session;
      return {
        ...session,
        submitted: true,
        outcome: action.outcome,
        transfer: action.transfer,
      };
    case "transfer":
      return session.submitted ? { ...session, transfer: action.transfer } : session;
    case "toggleReExplain":
      return { ...session, reExplain: !session.reExplain };
    case "retry":
      // Recalibrate down one step and re-open at the confidence gate — the
      // calibration hook fires on every attempt, retries included.
      return {
        ...session,
        stage: "confidence",
        conf: null,
        rung: 1,
        attempt: "",
        submitted: false,
        outcome: null,
        transfer: null,
        reExplain: false,
      };
    default:
      return session;
  }
}

/** The problem for the session's current rung (clamped to the ladder we ship). */
export function crucibleProblem(
  session: CrucibleSession,
  content: CrucibleContent,
): CrucibleProblem | undefined {
  return content.problems[Math.min(session.rung, content.problems.length - 1)];
}

/**
 * Where the ladder sits: the first attempt starts high (a Novel transfer, with
 * the two easier rungs already behind the learner); a re-attempt drops to the
 * Guided-application rung. Rungs before this show done, this one current.
 */
export function crucibleCurrentRung(session: CrucibleSession): number {
  return session.rung === 0 ? 2 : 1;
}

/**
 * The calibration read-back: predicted confidence held against what actually
 * happened. Overconfidence (felt sure, transfer broke) is the thing this phase
 * exists to catch; low confidence that proved real is well-calibrated.
 */
export function crucibleCalib(session: CrucibleSession, lang: Language = "en"): string {
  if (lang === "pt-BR") {
    if (session.outcome === "partial") {
      if (session.conf === 2)
        return "Você disse “Muito confiante” — e a transferência na primeira tentativa ainda quebrou. Essa distância entre a sensação e o resultado é exatamente o excesso de confiança que esta fase existe para pegar.";
      if (session.conf === 0)
        return "Você sinalizou baixa confiança, e o ponto instável era real — isso é bem calibrado. Agora feche essa lacuna.";
      return "Você se sentiu razoavelmente confiante, mas um subconceito não se transferiu. Registre a diferença entre se sentir pronto e estar pronto.";
    }
    if (session.outcome === "pass")
      return "Confiança e resultado agora se alinham — isso é domínio calibrado, não fluência.";
    return "";
  }
  if (session.outcome === "partial") {
    if (session.conf === 2)
      return "You said “Very confident” — and the first-try transfer still broke. That distance between the feeling and the result is exactly the overconfidence this phase exists to catch.";
    if (session.conf === 0)
      return "You flagged low confidence, and the shaky spot was real — that’s well-calibrated. Now close it.";
    return "You felt fairly confident, but one sub-concept didn’t transfer. Register the gap between feeling ready and being ready.";
  }
  if (session.outcome === "pass")
    return "Confidence and result now line up — that’s calibrated mastery, not fluency.";
  return "";
}
