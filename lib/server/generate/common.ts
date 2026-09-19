// The content engine: one generator per content kind. Each builds a prompt,
// asks OpenRouter for JSON (generateJson validates + retries once), then
// post-processes into the exact shapes the client renders — layout, ids, and
// gap offsets are computed here, never trusted from the model.

// ---- tiny validation helpers (throw readable errors for the retry loop) ----
import type { Domain, NodeKind, PhaseId } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/server/openrouter";

export function fail(msg: string): never {
  throw new Error(msg);
}

export function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(`${name} must be an object`);
  return v as Record<string, unknown>;
}

export function arr(v: unknown, name: string, min = 1, max = 40): unknown[] {
  if (!Array.isArray(v)) fail(`${name} must be an array`);
  if (v.length < min || v.length > max)
    fail(`${name} must have ${min}-${max} items (got ${v.length})`);
  return v;
}

export function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) fail(`${name} must be a non-empty string`);
  return v.trim();
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const s = str(v, name);
  if (!allowed.includes(s as T))
    fail(`${name} must be one of ${allowed.join(", ")} (got "${s}")`);
  return s as T;
}

// Phrases from our own prompt templates that must never appear verbatim in
// generated learner-facing labels — a match means the model echoed the
// template instead of writing a concrete answer (#10).
//
// This is the backstop, not the fix. The cause was that the shapes shipped
// their placeholders as plausible-looking *values*, so returning the blank
// looked like filling it in; each shape now carries a filled-in worked example
// instead. Entries stay in step with whatever placeholder wording the shapes
// currently use.
export const TEMPLATE_ECHOES = [
  "a complete, precise answer",
  "a hand-wave",
  "you'll feel it",
  "just trust it",
  "confidently wrong answer",
  "a real misconception",
  "what the learner says",
  "a common misconception as",
  "the learner's reply, in their own words",
  "written out in their voice",
];

export function rejectEcho(label: string, name: string): string {
  const lower = label.toLowerCase();
  for (const phrase of TEMPLATE_ECHOES)
    if (lower.includes(phrase))
      fail(
        `${name} echoes the prompt template ("${phrase}") — write the concrete answer itself, not a description of it`,
      );
  return label;
}

/** Reject "X instead of X" non-errors — a named error must actually differ (#10).
 *  Observed live: "resulting in [4, 2] instead of [4, 2]". */
export function rejectSelfIdenticalError(text: string, name: string): string {
  const lower = text.toLowerCase();
  const marker = " instead of ";
  const idx = lower.indexOf(marker);
  if (idx === -1) return text;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const before = norm(lower.slice(0, idx));
  const tail = norm(
    lower.slice(idx + marker.length).split(/[.;!?]|,\s(?:so|which|and)\b/)[0] ?? "",
  );
  if (tail && before.endsWith(tail)) {
    // Token boundary: "…wrote 16 instead of 6" must not match on the "6".
    const ch = before[before.length - tail.length - 1] ?? " ";
    if (!/[a-z0-9]/.test(ch))
      fail(
        `${name} names an error where before and after are identical ("${tail}") — describe a real, different error`,
      );
  }
  return text;
}

/** Nothing renders LaTeX — not the web's `Rich`, not the app's `Markdown` — so
 *  a model that reaches for it prints `A_b p_c^{n}` and `\(\dot r = a p^{0,3}\)`
 *  at the learner verbatim. Which of the two a screen got was pure luck of the
 *  draw, so the rule belongs in the system message every generator shares. */
export const MATH_RULE =
  "MATH: never use LaTeX or TeX markup — no backslash commands, no $…$, no \\(…\\), no ^{} or _{} braces. " +
  "Write every symbol, subscript, superscript, fraction and operator as plain Unicode text (ṙ, p⁰ʼ³, aᵦ, √x, ≤, ×, Δ, θ, x²), " +
  'or in words when Unicode cannot carry it ("dr/dt", "the b-th component"). Nothing downstream renders LaTeX; it reaches the learner as raw source.';

export const SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You are the content engine of Atlas, a mastery-learning platform built on a living concept map. " +
    "You produce rigorous, honest pedagogy: precise definitions, desirable difficulties, anti-sycophancy " +
    "(wrong reasoning is caught and named, never smoothed over). " +
    "Reply with ONLY one valid JSON object — no markdown fences, no prose before or after. " +
    MATH_RULE,
};

export function user(content: string): ChatMessage[] {
  return [SYSTEM, { role: "user", content }];
}

// Server-safe copy of lib/i18n.tsx's type — that file is "use client" and
// must never be imported from server code, so this is redeclared here (the
// base engine file) and re-exported for lib/server/job.ts to use.

/** Appended to every prompt. Field NAMES stay English (the app parses fixed
 *  keys) — only the natural-language VALUES the model writes should switch.
 *
 *  The explicit "don't copy the template" clause is load-bearing: the schemas
 *  above spell their example values out in English ("Novel transfer · a
 *  framing you were never handed", "Method of loci"), and without it the model
 *  echoes those verbatim and then writes the whole payload in English to
 *  match. */
export function languageNote(language: Language | undefined): string {
  return language === "pt-BR"
    ? '\n\nOUTPUT LANGUAGE: Brazilian Portuguese (pt-BR). Every natural-language string value you return must be written in Portuguese — including any label, tag, title or example text shown in the JSON template above. Translate those; never copy their English wording. Keep only JSON field names and enum values (e.g. "correct", "mastered", "conceptual", "list-like") exactly as specified in English.'
    : "";
}

/**
 * The sizing rule every sized generation shares.
 *
 * These prompts used to hand the model a count — 5 sections, 4 beats, 12-18
 * concepts — and a count reads as a quota: material worth three sections comes
 * back as five, two of which restate the others. The learner pays for that
 * twice, in the wait for a generation no cache can hide and again in the
 * reading. So every sized prompt asks for a RANGE and says what each end
 * actually means, which is what makes stopping early a correct answer rather
 * than a shortfall.
 */
export function sizeRule(p: {
  /** Plural noun for what is being counted — "sections", "beats". */
  unit: string;
  min: number;
  max: number;
  /** What genuinely earns the small end. */
  atMin: string;
  /** What genuinely earns the large end. */
  atMax: string;
}): string {
  return `SIZE — read it off the material, never off a quota: write ${p.min}-${p.max} ${p.unit}. ${p.min} is the right answer for ${p.atMin}; only ${p.atMax} earns ${p.max}. Add one only when it carries something none of the others do. Covering the material in ${p.min} and stopping is a correct answer, not a shortfall — padding to reach ${p.max} makes this worse, not more thorough.`;
}

/** Personal-interest flavoring shared by several prompts. */
export function interestNote(interests: string): string {
  return interests.trim()
    ? `Where an analogy helps, draw it from the learner's stated interests (${interests.trim()}) — but only when it genuinely fits.`
    : "Use concrete, everyday analogies when they genuinely fit.";
}

/**
 * The concept's boundary on the map: what the other passes already taught and
 * what they are going to. Every per-node generation gets this, because without
 * it each one is written as if its concept were the only thing on the map —
 * re-deriving a prerequisite three columns back, or teaching the next concept
 * before the learner ever clicks it.
 *
 * `prior` is licence, not an instruction to cover: build on it freely, never
 * re-teach it. `later` is a fence: name it in one clause if the connection is
 * genuinely load-bearing, never explain it.
 */
export function boundaryNote(params: {
  priorLabels?: string[];
  laterLabels?: string[];
}): string {
  const prior = (params.priorLabels ?? []).filter(Boolean);
  const later = (params.laterLabels ?? []).filter(Boolean);
  if (!prior.length && !later.length) return "";
  const lines = [
    "",
    "THE MAP AROUND THIS CONCEPT — the learner is working through a whole map, and every other concept on it has its own pass. Stay inside this one:",
  ];
  if (prior.length)
    lines.push(
      `- Already taught, earlier on the map: ${prior.join(", ")}. Assume all of it and build on it — refer to it by name, never re-explain or re-derive it. A recap of one of those is material the learner has already read.`,
    );
  if (later.length)
    lines.push(
      `- Taught later, by their OWN pass: ${later.join(", ")}. These are not yours. Do not explain, define, derive or work an example of any of them; at most name one in a single clause to say where this leads ("which is what X builds on"). Anything you teach here the learner meets again as a repeat.`,
    );
  lines.push(
    "- Anything the concept genuinely needs that appears in NEITHER list is yours to teach, in as much depth as it earns.",
  );
  return lines.join("\n") + "\n";
}

/**
 * How this kind of concept wants this phase written.
 *
 * The second lever. Which phases a node runs is half of it; a phase that every
 * plan contains still has to be written differently for a definition than for
 * a procedure — a `fact` does not want a worked example, and a `procedure`'s
 * worked example IS the material.
 *
 * `concept` returns "" everywhere on purpose: it is what every node was before
 * kinds existed, so an existing map's prompts are byte-identical and its cached
 * rows stay valid. That is also why `nodeKind` is omitted from the cache key
 * when it is `concept` (see `job.ts`) — no VERSION bump, no abandoned table.
 *
 * ponytail: Retain is missing on purpose. One deck spans many nodes, so a
 * single `nodeKind` cannot describe it — wire it when `retain`'s `nodes` list
 * carries a kind per node.
 */
export function kindNote(kind: NodeKind | undefined, phase: PhaseId): string {
  const note = kind && kind !== "concept" ? (KIND_NOTES[kind][phase] ?? "") : "";
  return note ? `\n${note}\n` : "";
}

/** Per-kind prompt guidance, by phase. Partial by design: a phase no kind
 *  wants to steer has no row, and every kind falls through to "". */
const KIND_NOTES: Record<
  Exclude<NodeKind, "concept">,
  Partial<Record<PhaseId, string>>
> = {
  fact: {
    consume:
      // Not "no worked example": `validateConsumeSection` requires one on every
      // section, so a model that obeyed had every section dropped, the stream
      // emptied, the single-shot fallback failed twice, and the learner got a
      // 502 on four billed calls. The figure half is safe — that one really is
      // optional. Keep the example small rather than asking for it to be gone.
      "THIS CONCEPT IS A FACT — an arbitrary association with nothing to reason from. Write 1-2 short sections and a hook that makes it stick. NO figure: there is no structure to draw. Keep the worked example to the shortest thing that shows the fact in use. Explanation is wasted here; the learner's job is to remember it.",
  },
  procedure: {
    consume:
      "THIS CONCEPT IS A PROCEDURE — an ordered sequence the learner must be able to carry out. The WORKED EXAMPLE is the material, not an illustration hung off it: show the steps being run, in order, on a real case, and say what each step is for. A figure is worth it only if it carries the order.",
    connect:
      "THIS CONCEPT IS A PROCEDURE. Link on SELECTION — which procedure applies when, and what distinguishes the cases where this one is right from the ones where a neighbouring procedure is.",
    crucible:
      "THIS CONCEPT IS A PROCEDURE. The problem must require the learner to SELECT this procedure, not merely run it: give a situation where choosing correctly is the hard part, not the arithmetic.",
  },
  principle: {
    consume:
      "THIS CONCEPT IS A PRINCIPLE — a causal relation or multi-stage mechanism. Give the mechanism and its derivation, not just the statement. A FIGURE IS REQUIRED and must carry the causal chain: each node a stage, each edge what that stage hands the next.",
    connect:
      "THIS CONCEPT IS A PRINCIPLE. Link on COMPOSITION — which principles combine with this one, and which appear to contradict it and why they don't.",
    crucible:
      "THIS CONCEPT IS A PRINCIPLE. Give a novel situation the principle PREDICTS, and ask for the prediction — not for a restatement of the relation.",
  },
};

/**
 * How this DOMAIN wants this phase written — the third lever.
 *
 * `kindNote` says a procedure's worked example is the material. This says what
 * counts as evidence at all, which `kind` cannot express: a `procedure` in
 * `formal` is a derivation checked by rules, the same `procedure` in `craft` is
 * work done away from the screen and reported back afterwards. Same kind, same
 * phase, two different passes.
 *
 * `general` returns "" everywhere on purpose, the way `concept` does for kinds:
 * it is what every node was before this axis existed, so an existing map's
 * prompts stay byte-identical and its cached rows stay addressable (which is
 * why `domainOf` omits it from the cache key in `job.ts`).
 *
 * Partial by design. A (domain, phase) pair the domain has nothing special to
 * say about has no row and falls through to "".
 */
export function domainNote(domain: Domain | undefined, phase: PhaseId): string {
  const note = domain && domain !== "general" ? (DOMAIN_NOTES[domain][phase] ?? "") : "";
  return note ? `\n${note}\n` : "";
}

const DOMAIN_NOTES: Record<
  Exclude<Domain, "general">,
  Partial<Record<PhaseId, string>>
> = {
  formal: {
    consume:
      "THIS IS A FORMAL DOMAIN — a claim here is settled by DERIVING it from stated rules. Give the derivation, not only the result, and work the example all the way through with real values so the learner sees every line. Never assert a step the reader is expected to take on trust.",
    perform:
      "THIS IS A FORMAL DOMAIN. The run produces a definite VALUE or expression, so the case must have exactly one correct answer and the final step must state it plainly — it is checked arithmetically, not read as prose. Name the intermediate quantity each step produces.",
    drill:
      "THIS IS A FORMAL DOMAIN. Drill RECOGNITION, never arithmetic: which rule applies, is this form eligible, does this condition hold. A call the learner can make in two seconds when fluent.",
    crucible:
      "THIS IS A FORMAL DOMAIN. Set the problem in a field the learner did not meet it in, and make SEEING that this structure applies the hard part — not the computation once it is seen.",
  },
  executable: {
    consume:
      "THIS IS AN EXECUTABLE DOMAIN — a claim here is settled by RUNNING it. Show the thing running, and show it failing: the failure mode teaches more than the happy path. Never describe behaviour the learner could simply be shown.",
    trace:
      "THIS IS AN EXECUTABLE DOMAIN. Walk the state, not the source: what each step leaves behind for the next one, and what is true after each line rather than what each line says.",
    perform:
      "THIS IS AN EXECUTABLE DOMAIN. The work must be something that RUNS, and the steps are what a correct run produces — an output, a passing check, a handled failure — never a description of the approach.",
  },
  empirical: {
    consume:
      "THIS IS AN EMPIRICAL DOMAIN — a claim here is settled by MEASUREMENT, and every measurement carries uncertainty. Give the quantity, how it is measured, and what would make the measurement wrong. A mechanism with no observable consequence is not finished.",
    predict:
      "THIS IS AN EMPIRICAL DOMAIN. Ask for the forecast of an actual measurement before it is shown — a direction and a rough magnitude — and then give the real result, including when it surprises.",
  },
  interpretive: {
    consume:
      "THIS IS AN INTERPRETIVE DOMAIN — a claim here is settled by a SOURCE read in context, and honest readers disagree. Anchor the passage to a date spine and to named actors, and say what was MATERIALLY at stake, not only what was argued. Name sources as sources. Where a position is contested, attribute it to who holds it and give that position its strongest form; never adjudicate a question of faith, and never present one tradition's reading as the neutral one.",
    socratic:
      "THIS IS AN INTERPRETIVE DOMAIN. Push on mechanism and material cause — who gained what, what an act actually cost, why it worked — rather than on doctrine or on which side was right.",
    connect:
      "THIS IS AN INTERPRETIVE DOMAIN. Link FORWARD IN TIME: what this made possible, what it foreclosed, and which later episode is unintelligible without it.",
    crucible:
      "THIS IS AN INTERPRETIVE DOMAIN. Transfer is not a novel field — it is a DIFFERENT CASE of the same kind. Give another episode and ask whether the same analysis holds and where it breaks.",
  },
  performative: {
    consume:
      "THIS IS A PERFORMATIVE DOMAIN — competence here is PRODUCTION, in real time, and explanation is not a substitute for it. Lead with comprehensible material the learner meets in use, slightly beyond what they can already produce. If a rule is worth stating at all, state it in two lines AT THE END, never as the opening. An essay about the skill is the wrong pass entirely.",
    discriminate:
      "THIS IS A PERFORMATIVE DOMAIN. Use MINIMAL PAIRS from real use, where the choice changes what is actually communicated — not textbook sentences that only illustrate a rule.",
    drill:
      "THIS IS A PERFORMATIVE DOMAIN. Drill PRODUCTION at speed, not recognition: the learner should be making the form, not picking it. Short items, no reading time.",
    recall:
      "THIS IS A PERFORMATIVE DOMAIN. Retrieval means PRODUCING the item from meaning, never recognising it among options.",
  },
  craft: {
    consume:
      "THIS IS A CRAFT DOMAIN — the work happens AWAY FROM THE SCREEN, on real material, and it is irreversible. Write a BRIEF, not an essay: what this stage produces, the tolerances that matter, the two or three ways it actually goes wrong, and what to have ready before starting. Assume the learner is standing up with tools in reach.",
    discriminate:
      "THIS IS A CRAFT DOMAIN. Contrast work that is within tolerance against work that is not, described concretely enough to judge by eye or by measurement, and name the failure each one leads to.",
    predict:
      "THIS IS A CRAFT DOMAIN, and the material does not forgive. Ask the learner to forecast the FAILURE before they commit: what goes wrong if this dimension is off, and at which later stage it shows up. Running the failure here is what stops them running it in the material.",
    perform:
      "THIS IS A CRAFT DOMAIN, so this is a DEBRIEF of work the learner has already done away from the screen — not a task to carry out on the page. The case is the stage they just built; the steps are what their REPORT has to contain for the work to be diagnosable: what fit, what gapped, the measurement of the worst joint, what they would redo. Grade the reported work, and say what the reported symptom implies about the cause.",
  },
};
