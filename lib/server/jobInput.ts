// The request vocabulary: what `/api/generate` accepts, and the normalization
// every job's inputs go through before they are hashed into a cache key.
//
// Split from `job.ts` because the two halves change for different reasons. A
// new input cap, a tighter label bound, a second axis on a node is a change to
// what a request *is*; a new kind is a change to what is *done* with one. This
// half is also the part that must never drift quietly, since every value in it
// moves cache addresses when it changes.

import { type CacheableKind } from "@/lib/server/contentCache";
import {
  asDomain,
  asNodeKind,
  type Domain,
  type GoalKind,
  type NodeKind,
} from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

export type GenerateKind = CacheableKind | "judge" | "diagnosticQuestion" | "passage";

export interface GenerateBody {
  kind: GenerateKind;
  /** The learner's chosen UI language — content comes back in it too.
   *  Defaults to "en" when absent (older clients, or judge calls that predate
   *  this field). Part of the cache key, so en/pt-BR generations never
   *  collide (see contentCache.ts VERSION). */
  language?: Language;
  topic?: string;
  goal?: GoalKind;
  paretoPct?: number;
  interests?: string;
  outline?: string;
  /** The topic is a scope the learner already picked, so the map prompt must
   *  build rather than offer to scope again (#30). Part of the cache key, and
   *  omitted unless true so ordinary builds keep their existing rows. */
  scoped?: boolean;
  /** Where the route files the result — never part of a cache key. `variant`
   *  separates two payloads of one kind on one node (section + lens). */
  topicId?: string;
  nodeId?: string;
  variant?: string;
  nodeLabel?: string;
  /** What kind of thing the concept is — it changes how a phase is written
   *  (`kindNote`), so it is part of the cache key. Omitted when `concept`,
   *  which is what every node was before kinds existed: every row already in
   *  `content_cache` keeps its address and no VERSION bump is owed. */
  nodeKind?: NodeKind;
  /** What settles a claim about it — see `nodeAxes`. */
  domain?: Domain;
  prereqLabels?: string[];
  /** The map around the concept — see `boundary` / `boundaryNote`. */
  priorLabels?: string[];
  laterLabels?: string[];
  /** What the other maps of this topic's continent teach. Set by the server
   *  alone (`withNeighbours`) — whatever a client sends is dropped. */
  neighbours?: string[];
  /** continentLinks: the continent's maps, each with its concept labels. */
  maps?: Array<{ subject?: unknown; labels?: unknown }>;
  // model fields — the section a lens was opened over, as it is on screen
  // (`kicker` is shared with the passage fields below)
  lens?: string;
  sectionBody?: string[];
  takeaway?: string;
  masteredLabels?: string[];
  pool?: Array<{ id: string; label: string }>;
  nodes?: Array<{ id: string; label: string; state: string }>;
  budgetMin?: number;
  // diagnosticQuestion fields
  difficulty?: string;
  index?: number;
  /** Background warm: the client is filling its cache, nobody is waiting. */
  prefetch?: boolean;
  /** crucible: which time through this concept's transfer test this is. 0 (or
   *  absent) is the first pass and keys exactly as it always did; a redo sends
   *  1, 2, … and gets a problem in a different domain rather than the one the
   *  learner has already solved. Part of the cache key, and omitted when 0 so
   *  rows written before it keep their address. */
  rerun?: number;
  // passage fields ("ask about this" — the learner's own words about a
  // highlighted stretch of the reading)
  /** The section's kicker — named by the model view and the passage ask alike. */
  kicker?: string;
  section?: string;
  selection?: string;
  // judge fields
  mode?:
    | "socratic"
    | "feynman"
    | "crucible"
    | "choice"
    | "recall"
    | "perform"
    | "steelman"
    | "produce";
  question?: string;
  options?: string[];
  reference?: string;
  answer?: string;
  /** judge-feynman / judge-recite: the rubric the answer is diffed against. */
  rubric?: Array<{ subPoint: string; mustConvey: string[] }>;
  /** judge-recall: the brief they worked from, and whether they took the cue. */
  brief?: string;
  cued?: boolean;
  /** judge-perform: the case the run was carried out on. */
  task?: string;
  problem?: string;
  hint?: string;
  /** judge-crucible: the learner revealed the reframe before answering. */
  hinted?: boolean;
  /** judge-steelman: the contested question, both positions with their rubrics,
   *  the case the learner wrote for each, and which side they came down on.
   *  `answer` carries the disconfirmer. */
  positions?: Array<{ id: string; label: string; heldBy: string; mustCover: string[] }>;
  cases?: Record<string, string>;
  holds?: string;
  /** judge-produce: the situation, what the turn asked for, and the forms it
   *  exists to elicit. `answer` carries the transcript of what was said. */
  scene?: string;
  cue?: string;
  targetForms?: string[];
  // judge-socratic fields (#A, #B) — the dialogue so far, the anticipated
  // misconceptions for this step, the ladder rung, this probe's own bar, and
  // everything already said against it (the verdict grades the union).
  history?: Array<{ role: "ai" | "learner"; text: string }>;
  attempt?: number;
  misconceptions?: Array<{ label: string; quality: string }>;
  recurring?: unknown;
  help?: number;
  sufficient?: unknown;
  said?: unknown;
}

/** A capped list of clean strings — the shape `recurring`, `sufficient` and
 *  `said` all wanted, written out separately three times before. */
export const strs = (v: unknown, cap: number): string[] | undefined =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .slice(0, cap)
        .map((x) => x.trim().slice(0, CAPS.freeText))
    : undefined;

// Input caps (#18) — a 100KB "topic" must never reach a prompt.
export const CAPS = {
  topic: 200,
  interests: 200,
  nodeLabel: 120,
  outline: 20_000,
  freeText: 4_000, // learner answers/attempts/explanations
  listItems: 30,
} as const;

export class BadRequest extends Error {
  // Set explicitly: a subclass inherits `Error.prototype.name`, and
  // `toAtlasError` (lib/errors.ts) matches on it — client code can't import
  // this class to `instanceof` it.
  constructor(message: string) {
    super(message);
    this.name = "BadRequest";
  }
}
export function badRequest(message: string): BadRequest {
  return new BadRequest(message);
}

export const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/**
 * The map around the concept, as the per-node prompts get it (`boundaryNote`):
 * what earlier concepts already taught, and what later ones own. Part of the
 * cache key on purpose — content written against a different map is different
 * content — and shared across learners, since gap nodes are excluded upstream
 * (`conceptBoundary`). Omitted entirely when empty so a request from before
 * this existed keys to the same row as one on a single-concept map.
 */
export const boundary = (
  body: GenerateBody,
): {
  priorLabels?: string[];
  laterLabels?: string[];
  neighbours?: string[];
} => {
  const priorLabels = labels(body.priorLabels);
  const laterLabels = labels(body.laterLabels);
  return {
    ...(priorLabels.length ? { priorLabels } : {}),
    ...(laterLabels.length ? { laterLabels } : {}),
    ...neighboursAxis(body),
  };
};

/** The continent's other maps (`withNeighbours`), or nothing outside one —
 *  omitted rather than empty, so a map on its own keys to the row it always
 *  did and no VERSION bump is owed. Each line is a whole map's worth of
 *  labels, so it is capped as free text rather than as a label. */
export const neighboursAxis = (body: GenerateBody): { neighbours?: string[] } => {
  const lines = Array.isArray(body.neighbours)
    ? body.neighbours
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .slice(0, CAPS.listItems)
        .map((x) => x.slice(0, CAPS.freeText))
    : [];
  return lines.length ? { neighbours: lines } : {};
};

/** The two axes a node is written on, each omitted when it is the default —
 *  same trick as `boundary`, and for the same reason: `concept` and `general`
 *  produce byte-identical prompts to the engine that predated them, so a plain
 *  node keys to the row it already wrote and no VERSION bump is owed. A node on
 *  a real kind or a real domain gets a different prompt, and correctly misses
 *  into a new key. */
export const nodeAxes = (
  body: GenerateBody,
): { nodeKind?: NodeKind; domain?: Domain } => {
  const k = asNodeKind(body.nodeKind);
  const d = asDomain(body.domain);
  return {
    ...(k === "concept" ? {} : { nodeKind: k }),
    ...(d === "general" ? {} : { domain: d }),
  };
};

export const labels = (v: unknown, max: number = CAPS.listItems): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .slice(0, max)
        .map((x) => x.slice(0, CAPS.nodeLabel))
    : [];

/** A judge rubric off the wire, capped. Shared by every mode that diffs an
 *  answer against rows — Feynman, Recall and Perform — because the *wire*
 *  shape is the same even where the grading is not. */
export const rubricRows = (
  body: GenerateBody,
): Array<{ subPoint: string; mustConvey: string[] }> =>
  Array.isArray(body.rubric)
    ? body.rubric
        .filter(
          (r) =>
            typeof r === "object" &&
            r !== null &&
            typeof r.subPoint === "string" &&
            Array.isArray(r.mustConvey),
        )
        .slice(0, CAPS.listItems)
        .map((r) => ({
          subPoint: r.subPoint.slice(0, CAPS.nodeLabel * 2),
          mustConvey: r.mustConvey
            .filter((m): m is string => typeof m === "string")
            .slice(0, 4)
            .map((m) => m.slice(0, CAPS.nodeLabel * 4)),
        }))
    : [];

/**
 * Candidate nodes a request offers a generator to choose among — Connect's
 * prior pool, the placement's probe candidates.
 *
 * Here rather than inline at each `case`, because it is request vocabulary and
 * both copies had to agree: a pool parsed one way in one branch and another
 * way in the next is a cache key that depends on which branch read it.
 */
export const poolOf = (body: GenerateBody): Array<{ id: string; label: string }> =>
  Array.isArray(body.pool)
    ? body.pool
        .filter(
          (p): p is { id: string; label: string } =>
            typeof p === "object" &&
            p !== null &&
            typeof p.id === "string" &&
            typeof p.label === "string",
        )
        .slice(0, CAPS.listItems)
    : [];
