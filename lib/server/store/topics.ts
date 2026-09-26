// The normalized run store — the data layer behind /api/v1.
//
// One topic is a row in `topics`, one concept a row in `nodes`, one card a row
// in `cards`, one generated payload a row in `node_content`. Everything hangs
// off `topics.id` with `on delete cascade`, so deleting a topic is one
// statement and cannot leave anything behind — that guarantee is the schema's,
// not this module's, which is the point of moving it there.
//
// What travels to a client is still the shape the screens already render: a
// graph, a StateMap, a positions map, a card array. The rows are how it is
// *stored*, not how it is drawn. That is what keeps a node drag one UPDATE
// while `useSpiral` and the iOS map keep reading what they always read.
//
// Every function here takes the caller's Supabase client, so RLS is what scopes
// the rows. No service-role client reaches this module.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Domain,
  CalibSample,
  ConceptEdge,
  ConceptNode,
  ConnectSession,
  ConsumeProgress,
  FeynmanSession,
  MisconceptionRecord,
  ModalityTally,
  ProgressState,
  NodeKind,
  PhaseId,
  PhaseProgress,
  ShakyReason,
  SocraticSession,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import { fail, readAll } from "@/lib/server/store/shared";
import { ownsContinent } from "@/lib/server/store/continents";
import { AtlasError } from "@/lib/errors";
import type { Language } from "@/lib/i18n";
// The wire contract lives with the client that speaks it — one definition of
// what a topic is, shared by the module that assembles it from rows and the
// module that reads it off the network.
import type {
  NewTopic,
  NodeDelta,
  Profile,
  ProfilePatch,
  Topic,
  TopicPatch,
} from "@/lib/persistence";

export type { NewTopic, NodeDelta, Profile, ProfilePatch, Topic, TopicPatch };

// ----------------------------------------------------------------- topics --

type TopicRow = {
  id: string;
  subject: string;
  goal: string;
  interests: string;
  pareto_pct: number;
  exam_date: string;
  language: string | null;
  calib_samples: CalibSample[];
  misconceptions: MisconceptionRecord[];
  modality_tally: ModalityTally;
  lit_today: string[];
  updated_at: string;
  /** Many-to-one, so PostgREST sends an object or null; untyped, it infers an array. */
  continent: unknown;
};

type NodeRow = {
  topic_id: string;
  id: string;
  label: string;
  summary: string | null;
  g: number;
  week: number;
  x: number;
  y: number;
  is_gap: boolean;
  state: ProgressState;
  shaky_reason: ShakyReason | null;
  reviewed: boolean;
  kind: NodeKind;
  domain: Domain;
  phase_plan: PhaseId[];
  phases_done: PhaseId[];
  consume_progress: ConsumeProgress | null;
  socratic_progress: SocraticSession | null;
  feynman_progress: FeynmanSession | null;
  connect_progress: ConnectSession | null;
  phase_progress: PhaseProgress | null;
};

type EdgeRow = { topic_id: string; from_id: string; to_id: string; dashed: boolean };

export type CardRow = {
  topic_id: string;
  id: string;
  node_id: string;
  type: StoredCard["type"];
  source: string;
  content: Record<string, unknown>;
  fsrs: StoredCard["fsrs"];
};

const TOPIC_COLUMNS =
  "id, subject, goal, interests, pareto_pct, exam_date, language, calib_samples, misconceptions, modality_tally, lit_today, updated_at, continent:continents(id, name, scopes)";
const NODE_COLUMNS =
  "topic_id, id, label, summary, g, week, x, y, is_gap, state, shaky_reason, reviewed, kind, domain, phase_plan, phases_done, consume_progress, socratic_progress, feynman_progress, connect_progress, phase_progress";
export const CARD_COLUMNS = "topic_id, id, node_id, type, source, content, fsrs";

/** A card row as the screens hold it. The content fields travel as one object
 *  rather than five nullable columns, so this is where they come back apart. */
export function toCard(row: CardRow): StoredCard {
  return {
    id: row.id,
    nodeId: row.node_id,
    type: row.type,
    source: row.source,
    ...(row.content as Partial<StoredCard>),
    fsrs: row.fsrs,
  } as StoredCard;
}

/** Rebuild one topic's client shape from its rows. */
function assemble(
  topic: TopicRow,
  nodes: NodeRow[],
  edges: EdgeRow[],
  cards: CardRow[],
): Topic {
  const out: Topic = {
    id: topic.id,
    subject: topic.subject,
    goal: topic.goal,
    interests: topic.interests,
    paretoPct: topic.pareto_pct,
    examDate: topic.exam_date,
    language: topic.language as Language | null,
    calibSamples: topic.calib_samples ?? [],
    misconceptions: topic.misconceptions ?? [],
    modalityTally: topic.modality_tally ?? ({} as ModalityTally),
    litToday: topic.lit_today ?? [],
    updatedAt: topic.updated_at,
    graph: { nodes: [], edges: [] },
    states: {},
    positions: {},
    shakyReasons: {},
    phasesDone: {},
    reviewedNodes: [],
    consumeProgress: {},
    socraticProgress: {},
    feynmanProgress: {},
    connectProgress: {},
    phaseProgress: {},
    cards: [],
    continent: (topic.continent as Topic["continent"]) ?? null,
  };
  for (const n of nodes) {
    const node: ConceptNode = {
      id: n.id,
      label: n.label,
      state: n.state,
      g: n.g,
      week: n.week,
      x: n.x,
      y: n.y,
      ...(n.summary ? { summary: n.summary } : null),
      ...(n.kind ? { kind: n.kind } : null),
      // Omitted when `general` for the same reason the cache key omits it:
      // that is exactly what every node was before this axis existed.
      ...(n.domain && n.domain !== "general" ? { domain: n.domain } : null),
      ...(n.phase_plan?.length ? { phasePlan: n.phase_plan } : null),
      ...(n.is_gap ? { gap: true } : null),
    };
    out.graph.nodes.push(node);
    out.states[n.id] = n.state;
    // Positions are their own map because the browser draws from it and never
    // from the node's generated coordinates; both are seeded here so the two
    // clients cannot disagree about where a node is.
    out.positions[n.id] = { x: n.x, y: n.y };
    // Only on a node that is actually Shaky. The reason used to be inert copy
    // — state was the input — so nothing cleared it when a flagged node later
    // went green, and prod carries rows that are `mastered` with a
    // `crucible-fail` on them. Now that state is *derived*, loading one of
    // those would re-derive the node Shaky the next time it finished a phase.
    if (n.shaky_reason && n.state === "shaky") out.shakyReasons[n.id] = n.shaky_reason;
    if (n.reviewed) out.reviewedNodes.push(n.id);
    if (n.phases_done?.length) out.phasesDone[n.id] = n.phases_done;
    if (n.consume_progress) out.consumeProgress[n.id] = n.consume_progress;
    if (n.socratic_progress) out.socraticProgress[n.id] = n.socratic_progress;
    if (n.feynman_progress) out.feynmanProgress[n.id] = n.feynman_progress;
    if (n.connect_progress) out.connectProgress[n.id] = n.connect_progress;
    // One key per parked post-catalogue phase; `{}` from the column default.
    if (n.phase_progress && Object.keys(n.phase_progress).length)
      out.phaseProgress[n.id] = n.phase_progress;
  }
  for (const e of edges)
    out.graph.edges.push([e.from_id, e.to_id, e.dashed] as ConceptEdge);
  for (const c of cards) out.cards.push(toCard(c));
  return out;
}

/**
 * Everything the app needs to draw, in four queries.
 *
 * Deliberately not per-topic: a learner's whole
 * library is a few hundred rows, and one round trip that returns all of it is
 * what makes first paint instant and an offline mirror possible. The large
 * thing — generated content — is not here; it is fetched per node by
 * `readContentRows` for the nodes about to be shown.
 */
export async function loadLibrary(db: SupabaseClient): Promise<Topic[]> {
  const { data: topics, error } = await db
    .from("topics")
    .select(TOPIC_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) fail("loadLibrary", error);
  const rows = (topics ?? []) as TopicRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((t) => t.id);
  // Paged: these three grow with the library, and a silent truncation here is
  // a topic that renders as an empty map. See `readAll`.
  const [nodes, edges, cards] = await Promise.all([
    readAll<NodeRow>(
      (a, b) => db.from("nodes").select(NODE_COLUMNS).in("topic_id", ids).range(a, b),
      "loadLibrary/nodes",
    ),
    readAll<EdgeRow>(
      (a, b) =>
        db
          .from("edges")
          .select("topic_id, from_id, to_id, dashed")
          .in("topic_id", ids)
          .range(a, b),
      "loadLibrary/edges",
    ),
    readAll<CardRow>(
      (a, b) => db.from("cards").select(CARD_COLUMNS).in("topic_id", ids).range(a, b),
      "loadLibrary/cards",
    ),
  ]);

  const by = <T extends { topic_id: string }>(list: T[]) => {
    const map = new Map<string, T[]>(ids.map((id) => [id, []]));
    for (const row of list) map.get(row.topic_id)?.push(row);
    return map;
  };
  const nodesBy = by(nodes);
  const edgesBy = by(edges);
  const cardsBy = by(cards);
  return rows.map((t) =>
    assemble(t, nodesBy.get(t.id)!, edgesBy.get(t.id)!, cardsBy.get(t.id)!),
  );
}

export async function loadTopic(db: SupabaseClient, id: string): Promise<Topic | null> {
  const { data, error } = await db
    .from("topics")
    .select(TOPIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("loadTopic", error);
  if (!data) return null;
  const [nodes, edges, cards] = await Promise.all([
    db.from("nodes").select(NODE_COLUMNS).eq("topic_id", id),
    db.from("edges").select("topic_id, from_id, to_id, dashed").eq("topic_id", id),
    db.from("cards").select(CARD_COLUMNS).eq("topic_id", id),
  ]);
  if (nodes.error) fail("loadTopic/nodes", nodes.error);
  if (edges.error) fail("loadTopic/edges", edges.error);
  if (cards.error) fail("loadTopic/cards", cards.error);
  return assemble(
    data as TopicRow,
    (nodes.data ?? []) as NodeRow[],
    (edges.data ?? []) as EdgeRow[],
    (cards.data ?? []) as CardRow[],
  );
}

/**
 * Create a topic and lay its map down in one pass.
 *
 * Upsert rather than insert: re-running onboarding on the same subject is a
 * rebuild of that topic, not a second one — the `(user_id, subject)` unique
 * constraint says so, and a 409 here would only teach the client to invent a
 * subject suffix.
 *
 * `created` says which of the two just happened, and it is not bookkeeping:
 * onboarding opens the topic *before* the map is generated and deletes it
 * again on any exit that produces no map. Without this flag that undo could
 * not tell a row it had just made from the learner's existing map of the same
 * subject — and deleting the second one cascades away their nodes, cards and
 * every generated payload.
 */
export async function createTopic(
  db: SupabaseClient,
  userId: string,
  topic: NewTopic,
): Promise<Topic & { created: boolean }> {
  // Asked before the upsert, because the upsert cannot answer it afterwards.
  const { data: existing, error: existingError } = await db
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("subject", topic.subject)
    .maybeSingle();
  if (existingError) fail("createTopic/existing", existingError);
  await continentIsMine(db, topic.continentId);

  const { data, error } = await db
    .from("topics")
    .upsert(
      {
        user_id: userId,
        subject: topic.subject,
        goal: topic.goal ?? "exam",
        interests: topic.interests ?? "",
        pareto_pct: topic.paretoPct ?? 20,
        exam_date: topic.examDate ?? "",
        ...(topic.language ? { language: topic.language } : null),
        ...(topic.continentId ? { continent_id: topic.continentId } : null),
      },
      { onConflict: "user_id,subject" },
    )
    .select(TOPIC_COLUMNS)
    .single();
  if (error) fail("createTopic", error);
  const row = data as TopicRow;
  // No `graph` branch: `putGraph` is gone. Neither client ever sent one — the
  // map lands as node deltas — and the rows it wrote named only the columns
  // that existed when it was written, so `kind`, `domain` and `phase_plan` all
  // fell to their defaults and every node arrived as a plain `concept` on an
  // empty ladder until a delta corrected it. A wire field no caller sets and
  // no path needs is one more way to write a wrong row.
  return { ...(await loadTopic(db, row.id))!, created: !existing };
}

export async function patchTopic(
  db: SupabaseClient,
  id: string,
  patch: TopicPatch,
): Promise<void> {
  const row = {
    ...(patch.goal !== undefined ? { goal: patch.goal } : null),
    ...(patch.interests !== undefined ? { interests: patch.interests } : null),
    ...(patch.paretoPct !== undefined ? { pareto_pct: patch.paretoPct } : null),
    ...(patch.examDate !== undefined ? { exam_date: patch.examDate } : null),
    ...(patch.language !== undefined ? { language: patch.language } : null),
    ...(patch.calibSamples !== undefined ? { calib_samples: patch.calibSamples } : null),
    ...(patch.misconceptions !== undefined
      ? { misconceptions: patch.misconceptions }
      : null),
    ...(patch.modalityTally !== undefined
      ? { modality_tally: patch.modalityTally }
      : null),
    ...(patch.litToday !== undefined ? { lit_today: patch.litToday } : null),
    ...(patch.continentId !== undefined ? { continent_id: patch.continentId } : null),
  };
  if (Object.keys(row).length === 0) return;
  await continentIsMine(db, patch.continentId);
  const { error } = await db.from("topics").update(row).eq("id", id);
  if (error) fail("patchTopic", error);
}

/** A foreign key ignores RLS, so a topic could otherwise join a continent
 *  that is somebody else's. `null` (leaving one) needs no check. */
async function continentIsMine(db: SupabaseClient, id: string | null | undefined) {
  if (id && !(await ownsContinent(db, id)))
    throw new AtlasError("invalid", "continentId: not the caller's continent");
}

/** One statement. The cascade takes nodes, edges, cards and node_content with
 *  it, and nulls the topic on the spend log rather than deleting it. */
export async function deleteTopic(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("topics").delete().eq("id", id);
  if (error) fail("deleteTopic", error);
}

/** Does this topic belong to the caller? RLS answers by returning nothing. */
export async function ownsTopic(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db.from("topics").select("id").eq("id", id).maybeSingle();
  if (error) fail("ownsTopic", error);
  return !!data;
}
