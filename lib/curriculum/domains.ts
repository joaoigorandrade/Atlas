// The domain axis: what counts as evidence in this corner of the world.
//
// `NodeKind` says what the learner must be able to *do* — tell instances apart,
// run a sequence, predict what changes. It deliberately does not say what
// subject the node belongs to (`KIND_RULE` in `lib/server/generate/map.ts`), and
// it structurally cannot: "settle it by deriving it" and "settle it by reading
// the source in context" are not two kinds of doing, they are two kinds of
// *warrant*. That is this axis.
//
// The two are orthogonal almost everywhere — a `procedure` exists in every
// domain — which is why this is a second field rather than more `NodeKind`
// values. `general` returns nothing everywhere, exactly as `concept` does for
// kinds, so a map built before domains existed behaves byte-identically and its
// cached rows stay addressable (see `domainOf` in `lib/server/job.ts`).
//
// Type-only import: `PhaseId` is erased at compile time, so `phases.ts` can
// import DOMAIN_PLAN from here without a runtime cycle.
import type { PhaseId } from "./phases";

/**
 * What settles a claim here.
 *
 * The discriminator is the *warrant*, never the subject: history and religion
 * are both `interpretive` because their epistemics are identical — a text, a
 * context, a contested reading, provenance that matters. The topic string
 * already carries the subject into every prompt; this carries the stance.
 *
 * `performative` and `craft` split on one question: **can the app observe the
 * production?** It can hear a spoken Spanish sentence and it cannot see a sofa.
 * That is not a shade of the same thing — it decides whether the app grades the
 * work or debriefs the learner about work it never saw, which is a different
 * ladder and a different gate.
 */
export type Domain =
  /** Derivation from stated rules. Mathematics, logic, theory. */
  | "formal"
  /** It runs, or it fails. Code, engineering, protocols. */
  | "executable"
  /** Measurement, carrying uncertainty. The sciences, medicine, econometrics. */
  | "empirical"
  /** A source, read in context, contested. History, religion, law, literature. */
  | "interpretive"
  /** Production under real conditions, which the app can observe. Language. */
  | "performative"
  /** Production the app cannot observe — a physical artifact. Woodwork, cooking. */
  | "craft"
  /** No stance. The pre-domain default, and the fallback for anything unclear. */
  | "general";

export const DOMAINS = [
  "formal",
  "executable",
  "empirical",
  "interpretive",
  "performative",
  "craft",
  "general",
] as const;

/** Lenient in both directions, like `asNodeKind`: anything unrecognized reads as
 *  `general`, so an older map, a newer server, or a model that invented a value
 *  degrades to the pre-domain behaviour rather than to nonsense. */
export function asDomain(raw: unknown): Domain {
  return (DOMAINS as readonly string[]).includes(raw as string)
    ? (raw as Domain)
    : "general";
}

/**
 * How a domain changes the ladder — the second of the four layers a domain
 * reaches (map semantics, ladder, prompt stance, verification).
 *
 * Two rule shapes, because two genuinely different things happen:
 *
 * - `add` merges rungs into whatever the node's kind already runs. This is the
 *   fix for the structural bug: `PHASE_PLAN.concept` contains no execution rung
 *   at all, so a `concept` node in a `formal` map could reach `mastered` without
 *   the learner ever computing anything.
 * - `plan` replaces the kind's ladder outright, for the domains where kind
 *   stops being the thing that decides. Explaining the preterite in your own
 *   words is not speaking Spanish: `performative` takes Socratic, Feynman and
 *   Crucible *off*, and no amount of prompt steering makes those rungs earn
 *   their place on a language map.
 *
 * Removal is safe against all three invariants in `tests/curriculum.test.ts`:
 * a shorter list is still a subsequence of `PHASE_ORDER`, and every rule here
 * still opens on Consume and closes on Retain.
 */
export type DomainPlanRule =
  { readonly add: readonly PhaseId[] } | { readonly plan: readonly PhaseId[] };

export const DOMAIN_PLAN: Partial<Record<Domain, DomainPlanRule>> = {
  // A claim is settled by deriving it, so the learner has to derive one. Watch
  // the derivation run, run it on a real case, then run it fast.
  formal: { add: ["trace", "perform", "drill"] },
  // Same three, for the same reason: reading about a program is not running one.
  executable: { add: ["trace", "perform", "drill"] },
  // Settled by measurement, so the test is whether it forecasts the measurement
  // before it is taken, and whether the learner can actually take it.
  empirical: { add: ["predict", "perform"] },
  // A claim is settled by a source read in context, so the learner reads one
  // (Provenance) and then carries the disagreement honestly (Steelman).
  interpretive: { add: ["provenance", "steelman"] },
  // Production the app can hear. Discriminate carries the boundaries (ser/estar,
  // preterite/imperfect), Drill carries automaticity, Produce is the live
  // utterance, Retain carries the deck — and nothing here is served by
  // explaining the language in prose.
  performative: {
    plan: ["consume", "discriminate", "drill", "produce", "recall", "retain"],
  },
  // Work the app never sees. Predict runs the failures in simulation before the
  // learner runs them in oak; Perform is the debrief of work already done.
  craft: { plan: ["consume", "discriminate", "predict", "perform", "retain"] },
};
