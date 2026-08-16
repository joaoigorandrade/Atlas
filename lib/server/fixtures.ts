// Fixture mode (docs/PLAN-QUALITY.md §1.1) — the app, minus OpenRouter.
//
//   ATLAS_FIXTURES=1  →  every generation resolves from the payloads below,
//                        deterministically, in zero milliseconds, for free.
//
// The payloads are typed as the exact interfaces the renderers consume, so
// `tsc` is what keeps them in step with the app — a fixture that drifts from a
// shape fails the typecheck gate rather than a Playwright run. They are written
// against a request, not frozen: node ids and labels come from the job that
// asked, because half the validators (and all of the reducers) reject content
// naming a concept the run has never heard of.
//
// What fixture mode does NOT fake: auth, persistence, the cache, or the wire
// format. A fixture job streams the same NDJSON frames a real one does.

import type {
  ConsumeChunk,
  ConsumeModelBeat,
  CrucibleContent,
  DiagnosticQuestion,
  ElaborationContent,
  FeynmanBeat,
  MapNode,
  RetainContent,
  SocraticStep,
} from "@/lib/curriculum";
import { FIXTURES } from "@/lib/fixtureMode";
import type { GenerateBody } from "@/lib/server/job";

export { FIXTURES };

/** What a fixture is allowed to know about the request that asked for it. */
interface Vars {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  /** Candidate/learned node ids from the request, padded so index access is
   *  always defined — a Connect fixture naming an id the pool never offered is
   *  content the reducer drops on the floor. */
  ids: string[];
  labels: string[];
}

function vars(body: GenerateBody): Vars {
  const list = (body.pool ?? body.nodes ?? []) as Array<{ id: string; label: string }>;
  const nodeId = body.nodeId || list[0]?.id || "n1";
  const nodeLabel = body.nodeLabel || list[0]?.label || "The concept";
  const ids = list.map((n) => n.id);
  const labels = list.map((n) => n.label);
  return {
    topic: body.topic || "the topic",
    nodeId,
    nodeLabel,
    ids: [ids[0] ?? nodeId, ids[1] ?? ids[0] ?? nodeId],
    labels: [labels[0] ?? nodeLabel, labels[1] ?? labels[0] ?? nodeLabel],
  };
}

// ---- the map ---------------------------------------------------------------

const MAP: Array<[string, string, string[]]> = [
  ["foundations", "Foundations", []],
  ["notation", "Notation", ["foundations"]],
  ["core-rule", "The core rule", ["notation"]],
  ["worked-cases", "Worked cases", ["core-rule"]],
  ["edge-cases", "Edge cases", ["core-rule"]],
  ["putting-it-together", "Putting it together", ["worked-cases", "edge-cases"]],
];

/** Column = topological depth, row = position within it — the same left-to-right
 *  reading the real layout produces, without the layout pass. */
function mapNodes(): MapNode[] {
  const depth = new Map<string, number>();
  const rows = new Map<number, number>();
  return MAP.map(([id, label, prereqs]) => {
    const g = prereqs.reduce((d, p) => Math.max(d, (depth.get(p) ?? 0) + 1), 0);
    depth.set(id, g);
    const row = rows.get(g) ?? 0;
    rows.set(g, row + 1);
    return {
      id,
      label,
      summary: `What ${label.toLowerCase()} is, in one line.`,
      prereqs,
      state: "unknown" as const,
      g,
      week: 0,
      x: 180 + g * 260,
      y: 160 + row * 150,
    };
  });
}

// ---- per-kind payloads -----------------------------------------------------

const consumeChunks = (v: Vars): ConsumeChunk[] =>
  [0, 1, 2].map((i) => ({
    id: `c${i + 1}`,
    kicker: `${i + 1} · ${["What it is", "How it works", "Where it breaks"][i]}`,
    terms: [{ t: v.nodeLabel, d: `The idea this section of ${v.topic} turns on.` }],
    body: [
      `${v.nodeLabel} is the part of ${v.topic} this section is about. Section ${i + 1} states it plainly, so the reading opens on material rather than on a question.`,
      `The second paragraph does the work: it takes the claim above and shows what follows from it, one step at a time, without reaching for a term the reading has not defined yet.`,
      `The third paragraph names the consequence — what you can now do that you could not do before reading it.`,
    ],
    example: {
      title: `${v.nodeLabel}, worked`,
      steps: [
        "Start from the statement above.",
        "Apply it to one concrete case.",
        "Read off what changed.",
      ],
    },
    takeaway: `${v.nodeLabel}: the one line to carry out of section ${i + 1}.`,
    diagram: "Input, rule, result.",
    figure: {
      nodes: [
        { id: "in", label: "Input" },
        { id: "rule", label: v.nodeLabel },
        { id: "out", label: "Result" },
      ],
      edges: [
        { from: "in", to: "rule" },
        { from: "rule", to: "out", label: "applies" },
      ],
    },
    ask: "What would break if this were false?",
    check: {
      q: `What does section ${i + 1} say about ${v.nodeLabel}?`,
      opts: [
        { label: "It is only ever a special case.", correct: false },
        { label: "It states the rule and what follows from it.", correct: true },
        { label: "It is unrelated to the topic.", correct: false },
      ],
      right: "Yes — that is the point of the section.",
      wrong: "Not quite — it was in the second paragraph.",
    },
  }));

const socraticSteps = (v: Vars): SocraticStep[] =>
  [0, 1, 2].map((i) => ({
    id: `s${i + 1}`,
    move: "Clarify" as const,
    prompt: `In your own words, what does ${v.nodeLabel} let you do that you could not do without it?`,
    replies: [
      {
        label: "It names the rule and what follows from it",
        quality: "correct" as const,
        response: "Yes — that is exactly the move.",
      },
      {
        label: "It is a special case of something else",
        quality: "wrong" as const,
        response: "Not quite — that is one instance, not the rule.",
      },
      {
        label: "Something about the rule",
        quality: "near" as const,
        response: "Close. Say which part does the work.",
      },
    ],
    hint: "Look at what the second paragraph ruled out.",
    tell: `${v.nodeLabel} states the rule the rest of ${v.topic} leans on.`,
    ...(i === 2 ? { spare: true } : null),
  }));

const feynmanBeats = (v: Vars): FeynmanBeat[] =>
  [0, 1].map((i) => ({
    id: `b${i + 1}`,
    subPoint: `${["What it claims", "Why it holds"][i]} in ${v.nodeLabel}`,
    mustConvey: [
      i === 0
        ? `that ${v.nodeLabel} states a rule, not an example`
        : `that the rule follows from the step before it`,
    ],
    fix: {
      probe: `Say the ${i === 0 ? "claim" : "reason"} again, without the jargon.`,
      replies: [
        { label: "the rule itself", correct: true, response: "That is it." },
        {
          label: "one example of it",
          correct: false,
          response: "That is a case, not the rule.",
        },
      ],
    },
    gap: {
      id: `${v.nodeId}-gap-${i + 1}`,
      label: `${v.nodeLabel}: ${["the claim", "the reason"][i]}`,
      reason: "Left unexplained in the teach-back.",
      dx: 0,
      dy: 90 + i * 60,
    },
  }));

const connectContent = (v: Vars): ElaborationContent => ({
  centerId: v.nodeId,
  centerLabel: v.nodeLabel,
  encoding: "conceptual",
  detectNote: "This concept is relational, not a list — links, not mnemonics.",
  center: { x: 290, y: 210 },
  cands: [
    { id: v.ids[0], label: v.labels[0], x: 90, y: 90, rel: `sets up ${v.nodeLabel}` },
    {
      id: v.ids[1],
      label: v.labels[1],
      x: 470,
      y: 300,
      rel: `is constrained by ${v.nodeLabel}`,
    },
  ],
});

const crucibleContent = (v: Vars): CrucibleContent => ({
  centerId: v.nodeId,
  centerLabel: v.nodeLabel,
  draws: [v.labels[0]],
  rungs: [{ label: "Recall a definition" }, { label: "Apply it in a new frame" }],
  gap: {
    id: `${v.nodeId}-transfer`,
    label: `${v.nodeLabel} under a new frame`,
    reason: "The rule was recalled but not carried across.",
    dx: 0,
    dy: 100,
  },
  problems: [
    {
      tag: "Novel transfer",
      q: `A case you have not seen: apply ${v.nodeLabel} where the usual framing does not hold. What do you get?`,
      hint: "Start from what the rule actually requires, not from the example you read.",
      placeholder: "Work it through…",
      sample:
        "The rule still applies, because its requirement is met — the framing is what changed.",
    },
    {
      tag: "Guided re-attempt",
      q: `Same case, one step at a time: what does ${v.nodeLabel} require, and is it met here?`,
      hint: "Name the requirement first, then check it.",
      placeholder: "Step one…",
      sample: "The requirement is met, so the result carries over unchanged.",
    },
  ],
  transfer: [
    { verdict: "good", text: "You named the rule correctly." },
    { verdict: "red", text: "The new framing was treated as a new rule." },
  ],
  reExplain: `The rule in ${v.nodeLabel} does not care about the framing — only about its requirement being met.`,
});

const retainContent = (body: GenerateBody, v: Vars): RetainContent => ({
  budgetMin: typeof body.budgetMin === "number" ? body.budgetMin : 8,
  cards: [
    {
      id: "r1",
      type: "recall",
      source: `your reading pass on ${v.labels[0]}`,
      node: v.ids[0],
      cloze: [`${v.labels[0]} states `, " that the rest of the topic leans on."],
      answer: "the rule",
      back: "the rule",
      fails: true,
      reExplain: "It is the rule, not an example of it.",
    },
    {
      id: "r2",
      type: "why",
      source: `your teach-back on ${v.labels[1]}`,
      node: v.ids[1],
      front: `Why does ${v.labels[1]} hold?`,
      back: "Because it follows from the step before it, given the same requirement.",
      fails: true,
      reExplain: "Trace it back one step and the reason is already there.",
    },
  ],
});

const diagnostic = (body: GenerateBody, v: Vars): DiagnosticQuestion => ({
  tag: "Placement",
  q: `Which of these is what ${v.labels[0]} actually claims?`,
  note: "One objective probe — answer from what you already know.",
  nodeId: v.ids[0],
  difficulty:
    body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : "medium",
  opts: [
    { label: "It is a worked example." },
    { label: "It states a rule the rest of the topic leans on." },
    { label: "It is a naming convention only." },
    { label: "It has no bearing on the topic." },
  ],
  correctIndex: 1,
});

const modelBeats = (v: Vars): ConsumeModelBeat[] =>
  [0, 1, 2].map((i) => ({
    label: ["The setup", "The move", "The payoff"][i],
    text: `${["First, hold the section's claim still.", "Then apply it to the case in front of you.", "What you are left with is the takeaway, arrived at rather than asserted."][i]} (${v.nodeLabel})`,
  }));

function judgement(body: GenerateBody): Record<string, unknown> {
  switch (body.mode) {
    case "choice":
      return { index: 0, response: "You named the mechanism." };
    case "feynman":
      return {
        // One ruling per rubric row: a row left unjudged spawns no gap, and the
        // validator on the live path rejects it for exactly that reason.
        verdicts: (body.rubric ?? []).map((_, i) => ({
          i,
          verdict: i === 0 ? "good" : "confused",
          ...(i === 0 ? null : { quote: "you said it followed, but not from what" }),
        })),
        response: "You had the claim. The reason behind it never arrived.",
        jargon: [],
      };
    case "crucible":
      return {
        outcome: "partial",
        transfer: [
          { verdict: "good", text: "The rule was recalled correctly." },
          { verdict: "red", text: "It was not carried into the new framing." },
        ],
        gapLabel: "Transfer under a new frame",
        gapReason: "The requirement was re-derived instead of checked.",
        reExplain: "The rule holds wherever its requirement is met.",
      };
    default:
      return {
        quality: "correct",
        response: "Yes — that is the move.",
      };
  }
}

/** The fixture payload for one resolved job, or null for a kind with none. */
export function fixturePayload(
  kind: string,
  body: GenerateBody,
): Record<string, unknown> | null {
  const v = vars(body);
  switch (kind) {
    case "curriculum":
      return { nodes: mapNodes() };
    case "summary":
      return { summary: `What ${v.nodeLabel} is, in one line.` };
    case "diagnosticQuestion":
      return { ...diagnostic(body, v) };
    case "consume":
      return { chunks: consumeChunks(v) };
    case "model":
      return { beats: modelBeats(v) };
    case "passage":
      return {
        answer: [
          `The stretch you highlighted says ${v.nodeLabel} applies whenever its requirement is met.`,
          "Nothing in the sentence depends on the example around it — that is why it generalizes.",
        ],
      };
    case "socratic":
      return { steps: socraticSteps(v) };
    case "feynman":
      return { beats: feynmanBeats(v) };
    case "connect":
      return { content: connectContent(v) };
    case "crucible":
      return { content: crucibleContent(v) };
    case "retain":
      return { content: retainContent(body, v) };
    case "judge":
      return { judgement: judgement(body) };
    default:
      return null;
  }
}

// ---- the seeded run store (docs/PLAN-QUALITY.md §1.2) ----------------------

/** One `run_states` row, in memory. */
export interface SeededRun {
  subject: string;
  snapshot: unknown;
  caches: unknown;
  /** Write order — `loadRunCore` wants the most recently touched run, exactly
   *  as the real query's `order("updated_at")` does. */
  at: number;
}

/**
 * Fixture-mode persistence: a module-level map instead of Postgres.
 *
 * One process serves the whole Playwright run, so this is all the storage a
 * seeded run needs — and it resets with the server, which is the behaviour a
 * test suite wants from its database anyway.
 */
export const seededRuns = new Map<string, SeededRun>();

export function seedRun(subject: string, patch: Partial<SeededRun>): void {
  const prev = seededRuns.get(subject);
  seededRuns.set(subject, {
    subject,
    snapshot: patch.snapshot ?? prev?.snapshot ?? null,
    caches: patch.caches ?? prev?.caches ?? null,
    at: Date.now(),
  });
}

/** Most recently touched first — the order `loadRunCore` and `listRuns` read. */
export function seededList(): SeededRun[] {
  return [...seededRuns.values()].sort((a, b) => b.at - a.at);
}

// ---- the Supabase stand-in -------------------------------------------------

/**
 * What `createClient()` hands back in fixture mode: a signed-in learner, an
 * empty quota, and a `from()` that swallows writes.
 *
 * Only the calls the server actually makes are implemented — `getClaims` (auth
 * on every route), `generation_log` inserts, and the quota RPC. Run state does
 * not come through here: the browser reads and writes it through
 * `/api/test/seed` instead (see lib/persistence.ts).
 */
export function fixtureSupabase() {
  const noop = { data: null, error: null };
  const table = {
    insert: async () => noop,
    upsert: async () => noop,
    delete: () => table,
    select: () => table,
    eq: () => table,
    order: () => table,
    limit: () => table,
    maybeSingle: async () => noop,
    then: (resolve: (v: typeof noop) => unknown) => resolve(noop),
  };
  return {
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: FIXTURE_USER_ID, email: FIXTURE_EMAIL } },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: FIXTURE_USER_ID, email: FIXTURE_EMAIL } },
        error: null,
      }),
    },
    from: () => table,
    rpc: async () => ({ data: 0, error: null }),
  };
}

export const FIXTURE_USER_ID = "00000000-0000-4000-8000-000000000001";
export const FIXTURE_EMAIL = "learner@fixture.test";
