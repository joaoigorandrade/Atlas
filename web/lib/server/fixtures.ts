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
  MapNode,
  RetainContent,
} from "@/lib/curriculum";
import { LADDER, type NodeDifficulty, type NodeKind } from "@/lib/curriculum";
import { FIXTURES } from "@/lib/fixtureMode";
import { PHASE_CONTENT } from "@/lib/server/fixturesPhases";
import { fixtureTable } from "@/lib/server/fixtureTables";
import { FIXTURE_DEEPER } from "@/lib/server/fixturesDepth";
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

/** Four concepts — the most a map holds — one of each kind, so fixture mode
 *  exercises every Perform form and both reliefs. */
const MAP: Array<[string, string, string[], NodeKind, NodeDifficulty]> = [
  ["foundations", "Foundations", [], "concept", "easy"],
  ["notation", "Notation", ["foundations"], "fact", "easy"],
  ["core-rule", "The core rule", ["notation"], "principle", "medium"],
  ["worked-cases", "Worked cases", ["core-rule"], "procedure", "medium"],
];

const TOO_BROAD = { scopes: ["Stars", "Cells"].map((l) => ({ label: l, note: l })) };

/** Column = topological depth, row = position within it — the same left-to-right
 *  reading the real layout produces, without the layout pass. */
function mapNodes(): MapNode[] {
  const depth = new Map<string, number>();
  const rows = new Map<number, number>();
  return MAP.map(([id, label, prereqs, kind, difficulty]) => {
    const g = prereqs.reduce((d, p) => Math.max(d, (depth.get(p) ?? 0) + 1), 0);
    depth.set(id, g);
    const row = rows.get(g) ?? 0;
    rows.set(g, row + 1);
    return {
      id,
      label,
      summary: `What ${label.toLowerCase()} is, in one line.`,
      ...(FIXTURE_DEEPER[id] ? { deeper: FIXTURE_DEEPER[id] } : null),
      kind,
      importance: "working" as const,
      difficulty,
      phasePlan: LADDER,
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
      wrong: "It was in the second paragraph.",
    },
  }));

const retainContent = (body: GenerateBody, v: Vars): RetainContent => ({
  budgetMin: typeof body.budgetMin === "number" ? body.budgetMin : 8,
  cards: [
    {
      id: "r1",
      type: "recall",
      source: "Consume",
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
      source: "Consume",
      node: v.ids[1],
      front: `Why does ${v.labels[1]} hold?`,
      back: "Because it follows from the step before it, given the same requirement.",
      fails: true,
      reExplain: "Trace it back one step and the reason is already there.",
    },
  ],
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
    // A card answered in own words and a Perform run both grade on verdict
    // rows — one ruling per rubric row.
    case "recall":
    case "perform":
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
    default:
      return { quality: "correct", response: "Yes — that is the move." };
  }
}

/** The fixture payload for one resolved job, or null for a kind with none. */
export function fixturePayload(
  kind: string,
  body: GenerateBody,
): Record<string, unknown> | null {
  const v = vars(body);
  switch (kind) {
    case "curriculum": // "Everything" is too broad, so a spec can chart a continent.
      return /^everything$/i.test(v.topic) ? TOO_BROAD : { nodes: mapNodes() };
    case "summary":
      return { summary: `What ${v.nodeLabel} is, in one line.` };
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
    case "retain":
      return { content: retainContent(body, v) };
    case "judge":
      return { judgement: judgement(body) };
    default:
      return kind in CONTENT ? { content: CONTENT[kind](v) } : null;
  }
}

/** Every phase whose payload is `{ content }`, written from the job's vars. */
const CONTENT: Record<string, (v: Vars) => unknown> = PHASE_CONTENT;

// ---- the Supabase stand-in -------------------------------------------------

/**
 * What `createClient()` hands back in fixture mode: a signed-in learner, an
 * empty quota, and tables that actually store what is written to them.
 *
 * The tables matter: every route now reaches persistence through
 * `lib/server/store.ts`, so fixture mode exercises the same reads, the same
 * upserts and the same cascade the live path does — rather than a second
 * implementation that could drift from it silently.
 */
export function fixtureSupabase() {
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
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => fixtureTable(table),
    rpc: async () => ({ data: 0, error: null }),
  };
}

export const FIXTURE_USER_ID = "00000000-0000-4000-8000-000000000001";
export const FIXTURE_EMAIL = "learner@fixture.test";
