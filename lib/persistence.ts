// The run as it travels: the wire contract between the app and /api/v1, and
// the client that speaks it.
//
// This file used to be a PostgREST module — the browser reached into
// `run_states` itself, which meant the storage shape was encoded in two clients
// and could not change without releasing both. Now the server owns the schema
// and this is the only vocabulary either client knows: a topic, a profile, and
// a node delta.
//
// What a topic looks like here is deliberately *not* what it looks like in
// Postgres. Rows are how a run is stored — one per node, one per card, so a
// drag is one UPDATE and a graded card is one row. A graph, a StateMap and a
// positions map are how it is drawn. `lib/server/store.ts` translates between
// them; everything above this line only ever sees the drawing.

import {
  migrateConsume,
  usableRubrics,
  type LegacyConsumeChunk,
} from "@/lib/contentMigrate";
import { AtlasError, codeForStatus, isErrorCode } from "@/lib/errors";
import type {
  AdherenceState,
  CalibSample,
  ConceptGraph,
  ConnectSession,
  ConsumeChunk,
  ConsumeModelBeat,
  ConsumeProgress,
  CrucibleContent,
  ElaborationContent,
  FeynmanBeat,
  FeynmanSession,
  MisconceptionRecord,
  ModalityTally,
  ProgressState,
  RetainContent,
  ReviewGrade,
  ShakyReason,
  SocraticSession,
  SocraticStep,
  StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import type { Language } from "@/lib/i18n";

// ---------------------------------------------------------- the contract --

/** The learner, not the run. One streak, finally — it used to be copied into
 *  every topic's snapshot and a third time into the iOS UserDefaults. */
export interface Profile {
  dailyTarget: number;
  language: Language | null;
  adherence: AdherenceState;
}

/** A whole run, as a client draws it. */
export interface Topic {
  id: string;
  subject: string;
  goal: string;
  interests: string;
  paretoPct: number;
  examDate: string;
  language: Language | null;
  calibSamples: CalibSample[];
  misconceptions: MisconceptionRecord[];
  modalityTally: ModalityTally;
  litToday: string[];
  updatedAt: string;
  graph: ConceptGraph;
  states: StateMap;
  positions: Record<string, { x: number; y: number }>;
  shakyReasons: Record<string, ShakyReason>;
  reviewedNodes: string[];
  consumeProgress: Record<string, ConsumeProgress>;
  socraticProgress: Record<string, SocraticSession>;
  feynmanProgress: Record<string, FeynmanSession>;
  connectProgress: Record<string, ConnectSession>;
  cards: StoredCard[];
}

/** One node's changed fields — the unit every map write is made of. A drag is
 *  `{id, x, y}`; finishing Crucible is `{id, state}`. */
export interface NodeDelta {
  id: string;
  label?: string;
  summary?: string;
  g?: number;
  week?: number;
  x?: number;
  y?: number;
  isGap?: boolean;
  state?: ProgressState;
  /** `null` clears it — a node that stopped being shaky. */
  shakyReason?: ShakyReason | null;
  reviewed?: boolean;
  consumeProgress?: ConsumeProgress | null;
  socraticProgress?: SocraticSession | null;
  feynmanProgress?: FeynmanSession | null;
  connectProgress?: ConnectSession | null;
  /** Prerequisites to attach — only meaningful for a node being created. */
  prereqs?: string[];
}

export interface TopicPatch {
  goal?: string;
  interests?: string;
  paretoPct?: number;
  examDate?: string;
  language?: Language;
  calibSamples?: CalibSample[];
  misconceptions?: MisconceptionRecord[];
  modalityTally?: ModalityTally;
  litToday?: string[];
}

export interface ProfilePatch {
  dailyTarget?: number;
  language?: Language;
  adherence?: Partial<AdherenceState>;
}

export interface NewTopic extends TopicPatch {
  subject: string;
  graph?: ConceptGraph;
}

/**
 * Per-node generated content, as the screens hold it.
 *
 * Still the shape the app has always rendered from — but it is now assembled
 * from `node_content` rows on the way in and never written back. The server
 * records content the moment it generates it, which is what retired the
 * `caches` column and the four-second upload behind it.
 */
export interface RunCaches {
  consume: Record<string, ConsumeChunk[]>;
  /** Lens views already opened, keyed `model:<nodeId>:<chunkId>:<lens>`. */
  models: Record<string, ConsumeModelBeat[]>;
  socratic: Record<string, SocraticStep[]>;
  feynman: Record<string, FeynmanBeat[]>;
  connect: Record<string, ElaborationContent>;
  crucible: Record<string, CrucibleContent>;
  retain: RetainContent | null;
}

export const emptyCaches = (): RunCaches => ({
  consume: {},
  models: {},
  socratic: {},
  feynman: {},
  connect: {},
  crucible: {},
  retain: null,
});

// ------------------------------------------------------------- the client --

const V1 = "/api/v1";

/** Non-OK → a classified error, preferring the server's own code. Mirrors
 *  `failure` in lib/api.ts; kept separate so this module stays free of the
 *  generation vocabulary. */
async function failure(res: Response, op: string): Promise<AtlasError> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    reason?: string;
  } | null;
  const code = isErrorCode(body?.code) ? body.code : codeForStatus(res.status);
  return new AtlasError(code, `${op}: ${body?.error ?? res.status}`, {
    status: res.status,
    requestId: res.headers.get("x-atlas-request-id") ?? undefined,
    reason: body?.reason,
  });
}

async function call<T>(
  op: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${V1}${path}`, {
    method: init?.method,
    ...(init?.body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.body),
        }
      : null),
  });
  if (!res.ok) throw await failure(res, op);
  return (await res.json().catch(() => null)) as T;
}

/**
 * Everything the app draws, in one request: the learner's profile and their
 * whole library — every topic with its map, its mastery states and its cards.
 *
 * One round trip on purpose. It used to be three (the run core, the library
 * list, the content column) with the first paint waiting on one of them.
 * Generated content is deliberately absent; `loadContent` fetches it behind an
 * already-interactive map.
 */
export function bootstrap(): Promise<{ profile: Profile; topics: Topic[] }> {
  return call("bootstrap", "/bootstrap");
}

export function loadTopic(id: string): Promise<Topic> {
  return call("loadTopic", `/topics/${id}`);
}

export function createTopic(topic: NewTopic): Promise<Topic> {
  return call("createTopic", "/topics", { method: "POST", body: topic });
}

export function patchTopic(id: string, patch: TopicPatch): Promise<void> {
  return call("patchTopic", `/topics/${id}`, { method: "PATCH", body: patch });
}

/**
 * Drop a topic entirely — the learner excluding it from the dashboard.
 *
 * One statement on the server, and the foreign keys take the map, the mastery
 * states, the cards and every generated payload with it. Nothing to remember to
 * clean up, because there is nowhere for anything to be left.
 */
export function deleteTopic(id: string): Promise<void> {
  return call("deleteTopic", `/topics/${id}`, { method: "DELETE" });
}

/** The map's only write path: what changed, and what left the map. */
export function patchNodes(
  id: string,
  deltas: NodeDelta[],
  remove: string[] = [],
): Promise<void> {
  return call("patchNodes", `/topics/${id}/nodes`, {
    method: "PATCH",
    body: { deltas, remove },
  });
}

export function putCards(id: string, cards: StoredCard[]): Promise<void> {
  return call("putCards", `/topics/${id}/cards`, { method: "PUT", body: { cards } });
}

export function deleteCards(id: string, ids: string[]): Promise<void> {
  return call("deleteCards", `/topics/${id}/cards`, {
    method: "DELETE",
    body: { ids },
  });
}

/**
 * Today's deck: what is due, budgeted to the daily minutes, with the real
 * interval already on every grade button.
 *
 * The labels come from the server because that is where the scheduler runs for
 * a client that does not carry it. The browser has `ts-fsrs` and builds the
 * same object locally from the same function; this exists for the one that
 * doesn't.
 */
export function loadReview(
  id: string,
  at: { budgetMin: number; lang: Language },
): Promise<RetainContent> {
  return call(
    "loadReview",
    `/topics/${id}/review?budgetMin=${at.budgetMin}&lang=${encodeURIComponent(at.lang)}`,
  );
}

/** Grade one card through the real scheduler and get it back with its next due
 *  date. One row, one round trip — never the whole deck. */
export function gradeCard(
  id: string,
  cardId: string,
  grade: ReviewGrade,
): Promise<{ card: StoredCard }> {
  return call("gradeCard", `/topics/${id}/review`, {
    method: "POST",
    body: { cardId, grade },
  });
}

export function patchProfile(patch: ProfilePatch): Promise<Profile> {
  return call("patchProfile", "/profile", { method: "PATCH", body: patch });
}

/** One generated payload as it arrives from the content route. Its `payload`
 *  is the shape its screen renders — the server takes the generator's envelope
 *  off (`renderShape`). See `docs/CONTENT-STORAGE.md`. */
export interface ContentItem {
  nodeId: string;
  kind: string;
  variant: string;
  payload: unknown;
}

/**
 * The topic's generated content, folded back into the shape the screens read.
 *
 * With no arguments this asks for everything the topic has — what a map open
 * does once, behind an already-drawn map. Narrow it to the nodes and kinds a
 * screen is about to need when that is all you want.
 */
export async function loadContentItems(
  id: string,
  at?: { nodes?: string[]; kinds?: string[] },
): Promise<ContentItem[]> {
  const params = new URLSearchParams();
  if (at?.nodes?.length) params.set("nodes", at.nodes.join(","));
  if (at?.kinds?.length) params.set("kinds", at.kinds.join(","));
  const query = params.toString();
  const { items } = await call<{ items: ContentItem[] }>(
    "loadContent",
    `/topics/${id}/content${query ? `?${query}` : ""}`,
  );
  return items ?? [];
}

/**
 * The topic's items, folded into the buckets the screens read.
 *
 * A bucket and its key *are* the address: `consume[nodeId]` is
 * `nodeId|consume|`, and `models` carries the variant because that is the only
 * kind with two payloads on one node. Nothing else may enter this — a key
 * derived from anything but (node, kind, variant) is a key that moves when the
 * learner's progress does, which is what used to make the phone regenerate a
 * Connect the topic already owned.
 */
export function foldContent(items: ContentItem[]): RunCaches {
  // Every payload arrives in the shape its screen renders — the server takes
  // the generator's envelope off (`renderShape`), so there is nothing to
  // unwrap here and no kind-by-kind knowledge of one on this side of the wire.
  const caches = emptyCaches();
  for (const item of items ?? []) {
    switch (item.kind) {
      case "consume":
        caches.consume[item.nodeId] = item.payload as ConsumeChunk[];
        break;
      case "model":
        // The lens bucket keeps its flat composite key: one node has as many
        // walkthroughs as the learner has opened lenses over its sections.
        caches.models[`model:${item.nodeId}:${item.variant}`] =
          item.payload as ConsumeModelBeat[];
        break;
      case "socratic":
        caches.socratic[item.nodeId] = item.payload as SocraticStep[];
        break;
      case "feynman":
        caches.feynman[item.nodeId] = item.payload as FeynmanBeat[];
        break;
      case "connect":
        caches.connect[item.nodeId] = item.payload as ElaborationContent;
        break;
      case "crucible":
        caches.crucible[item.nodeId] = item.payload as CrucibleContent;
        break;
      case "retain":
        caches.retain = item.payload as RetainContent;
        break;
    }
  }

  // The two payloads whose shape changed under them. See lib/contentMigrate.ts:
  // a row the normalization carried over from the `caches` column may predate
  // either rewrite, and a hit is never re-validated.
  return {
    ...caches,
    consume: migrateConsume(
      caches.consume as unknown as Record<string, LegacyConsumeChunk[]>,
    ),
    feynman: usableRubrics(caches.feynman),
  };
}

/** Fetch and fold in one call — what a caller with no mirror behind it wants. */
export async function loadContent(
  id: string,
  at?: { nodes?: string[]; kinds?: string[] },
): Promise<RunCaches> {
  return foldContent(await loadContentItems(id, at));
}
