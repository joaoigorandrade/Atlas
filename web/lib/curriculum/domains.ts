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
 * The map's own domain, read back off the nodes it produced.
 *
 * The domain shapes the map before any node exists, but it is the nodes that
 * come back — so afterwards the way to ask "what settles a claim in this
 * topic" is to count them. Anything that needs the answer at topic level
 * (placement, which is asked about the topic and not about a node) reads it
 * here rather than keeping a second copy that can drift from the nodes.
 */
export function topicDomainOf(
  nodes: ReadonlyArray<{ readonly domain?: Domain }>,
): Domain {
  // `general` is the absence of an answer rather than an answer, so it does
  // not get a vote: a map where the model labelled most nodes and defaulted
  // the rest has the labelled domain, not a tie against the defaults.
  const counts = new Map<Domain, number>();
  for (const n of nodes)
    if (n.domain && n.domain !== "general")
      counts.set(n.domain, (counts.get(n.domain) ?? 0) + 1);
  let best: Domain = "general";
  let most = 0;
  // Insertion order breaks a tie, so the answer is stable for a given map.
  for (const [domain, n] of counts)
    if (n > most) {
      best = domain;
      most = n;
    }
  return best;
}
