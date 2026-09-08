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
import { AtlasError } from "@/lib/errors";
import type {
  AdherenceState,
  CalibSample,
  ConceptEdge,
  ConceptGraph,
  ConceptNode,
  ConnectSession,
  ConsumeProgress,
  FeynmanSession,
  MisconceptionRecord,
  ModalityTally,
  ProgressState,
  ReviewGrade,
  ShakyReason,
  SocraticSession,
} from "@/lib/curriculum";
import { gradeStoredCard, type StoredCard } from "@/lib/fsrs";
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

function fail(op: string, error: { message: string } | null): never {
  throw new AtlasError("upstream", `${op}: ${error?.message ?? "unknown"}`);
}

// ---------------------------------------------------------------- profile --

const PROFILE_COLUMNS =
  "daily_target, language, streak, best, freezes, last_day, met_today, usual_time, reminder_on, history";

type ProfileRow = {
  daily_target: number;
  language: string | null;
  streak: number;
  best: number;
  freezes: number;
  last_day: string;
  met_today: boolean;
  usual_time: string;
  reminder_on: boolean;
  history: AdherenceState["history"];
};

const toProfile = (row: ProfileRow | null): Profile => ({
  dailyTarget: row?.daily_target ?? 15,
  language: (row?.language as Language | null) ?? null,
  adherence: {
    streak: row?.streak ?? 0,
    best: row?.best ?? 0,
    freezes: row?.freezes ?? 0,
    lastDay: row?.last_day ?? "",
    metToday: row?.met_today ?? false,
    usualTime: row?.usual_time ?? "",
    reminderOn: row?.reminder_on ?? false,
    history: row?.history ?? [],
  },
});

export async function getProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await db.from("profiles").select(PROFILE_COLUMNS).maybeSingle();
  if (error) fail("getProfile", error);
  // A learner with no row yet is not an error — it is a learner who has never
  // finished a day. The defaults are the answer.
  void userId;
  return toProfile(data as ProfileRow | null);
}

export async function patchProfile(
  db: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const a = patch.adherence ?? {};
  const row = {
    user_id: userId,
    ...(patch.dailyTarget !== undefined ? { daily_target: patch.dailyTarget } : null),
    ...(patch.language !== undefined ? { language: patch.language } : null),
    ...(a.streak !== undefined ? { streak: a.streak } : null),
    ...(a.best !== undefined ? { best: a.best } : null),
    ...(a.freezes !== undefined ? { freezes: a.freezes } : null),
    ...(a.lastDay !== undefined ? { last_day: a.lastDay } : null),
    ...(a.metToday !== undefined ? { met_today: a.metToday } : null),
    ...(a.usualTime !== undefined ? { usual_time: a.usualTime } : null),
    ...(a.reminderOn !== undefined ? { reminder_on: a.reminderOn } : null),
    ...(a.history !== undefined ? { history: a.history } : null),
  };
  const { data, error } = await db
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) fail("patchProfile", error);
  return toProfile(data as ProfileRow);
}

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
  consume_progress: ConsumeProgress | null;
  socratic_progress: SocraticSession | null;
  feynman_progress: FeynmanSession | null;
  connect_progress: ConnectSession | null;
};

type EdgeRow = { topic_id: string; from_id: string; to_id: string; dashed: boolean };

type CardRow = {
  topic_id: string;
  id: string;
  node_id: string;
  type: StoredCard["type"];
  source: string;
  content: Record<string, unknown>;
  fsrs: StoredCard["fsrs"];
};

const TOPIC_COLUMNS =
  "id, subject, goal, interests, pareto_pct, exam_date, language, calib_samples, misconceptions, modality_tally, lit_today, updated_at";
const NODE_COLUMNS =
  "topic_id, id, label, summary, g, week, x, y, is_gap, state, shaky_reason, reviewed, consume_progress, socratic_progress, feynman_progress, connect_progress";
const CARD_COLUMNS = "topic_id, id, node_id, type, source, content, fsrs";

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
    reviewedNodes: [],
    consumeProgress: {},
    socraticProgress: {},
    feynmanProgress: {},
    connectProgress: {},
    cards: [],
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
      ...(n.is_gap ? { gap: true } : null),
    };
    out.graph.nodes.push(node);
    out.states[n.id] = n.state;
    // Positions are their own map because the browser draws from it and never
    // from the node's generated coordinates; both are seeded here so the two
    // clients cannot disagree about where a node is.
    out.positions[n.id] = { x: n.x, y: n.y };
    if (n.shaky_reason) out.shakyReasons[n.id] = n.shaky_reason;
    if (n.reviewed) out.reviewedNodes.push(n.id);
    if (n.consume_progress) out.consumeProgress[n.id] = n.consume_progress;
    if (n.socratic_progress) out.socraticProgress[n.id] = n.socratic_progress;
    if (n.feynman_progress) out.feynmanProgress[n.id] = n.feynman_progress;
    if (n.connect_progress) out.connectProgress[n.id] = n.connect_progress;
  }
  for (const e of edges)
    out.graph.edges.push([e.from_id, e.to_id, e.dashed] as ConceptEdge);
  for (const c of cards)
    out.cards.push({
      id: c.id,
      nodeId: c.node_id,
      type: c.type,
      source: c.source,
      ...(c.content as Partial<StoredCard>),
      fsrs: c.fsrs,
    } as StoredCard);
  return out;
}

/**
 * Everything the app needs to draw, in four queries.
 *
 * Deliberately not paginated and deliberately not per-topic: a learner's whole
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
  const [nodes, edges, cards] = await Promise.all([
    db.from("nodes").select(NODE_COLUMNS).in("topic_id", ids),
    db.from("edges").select("topic_id, from_id, to_id, dashed").in("topic_id", ids),
    db.from("cards").select(CARD_COLUMNS).in("topic_id", ids),
  ]);
  if (nodes.error) fail("loadLibrary/nodes", nodes.error);
  if (edges.error) fail("loadLibrary/edges", edges.error);
  if (cards.error) fail("loadLibrary/cards", cards.error);

  const by = <T extends { topic_id: string }>(list: T[] | null) => {
    const map = new Map<string, T[]>(ids.map((id) => [id, []]));
    for (const row of list ?? []) map.get(row.topic_id)?.push(row);
    return map;
  };
  const nodesBy = by(nodes.data as NodeRow[]);
  const edgesBy = by(edges.data as EdgeRow[]);
  const cardsBy = by(cards.data as CardRow[]);
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
 */
export async function createTopic(
  db: SupabaseClient,
  userId: string,
  topic: NewTopic,
): Promise<Topic> {
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
      },
      { onConflict: "user_id,subject" },
    )
    .select(TOPIC_COLUMNS)
    .single();
  if (error) fail("createTopic", error);
  const row = data as TopicRow;
  if (topic.graph) await putGraph(db, userId, row.id, topic.graph);
  return (await loadTopic(db, row.id))!;
}

/** Replace a topic's map. Used by onboarding and by a re-plan that restructures. */
export async function putGraph(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  graph: ConceptGraph,
): Promise<void> {
  const nodes = graph.nodes.map((n) => ({
    topic_id: topicId,
    id: n.id,
    user_id: userId,
    label: n.label,
    summary: n.summary ?? null,
    g: n.g,
    week: n.week,
    x: n.x,
    y: n.y,
    is_gap: n.gap === true,
    state: n.state,
  }));
  const edges = graph.edges.map(([from, to, dashed]) => ({
    topic_id: topicId,
    from_id: from,
    to_id: to,
    user_id: userId,
    dashed: dashed === true,
  }));
  if (nodes.length) {
    // `ignoreDuplicates` so laying a re-planned map over an existing one adds
    // the new concepts without resetting the mastery of the ones that survived.
    const { error } = await db
      .from("nodes")
      .upsert(nodes, { onConflict: "topic_id,id", ignoreDuplicates: true });
    if (error) fail("putGraph/nodes", error);
  }
  if (edges.length) {
    const { error } = await db
      .from("edges")
      .upsert(edges, { onConflict: "topic_id,from_id,to_id", ignoreDuplicates: true });
    if (error) fail("putGraph/edges", error);
  }
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
    ...(patch.misconceptions !== undefined ? { misconceptions: patch.misconceptions } : null),
    ...(patch.modalityTally !== undefined ? { modality_tally: patch.modalityTally } : null),
    ...(patch.litToday !== undefined ? { lit_today: patch.litToday } : null),
  };
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from("topics").update(row).eq("id", id);
  if (error) fail("patchTopic", error);
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

// ------------------------------------------------------------------ nodes --

/**
 * Apply a batch of node deltas. This is the only write path for the map.
 *
 * A drag is one row's x/y; finishing Crucible is one row's state. What used to
 * be a whole-run upload on a 1.2-second debounce is now a payload proportional
 * to what actually changed — which is what makes the map feel live rather than
 * saved.
 *
 * Upsert, not update: `spawnGap` invents a node client-side and the same call
 * that sets its state has to be able to create it.
 */
export async function applyNodeDeltas(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  deltas: NodeDelta[],
): Promise<void> {
  if (deltas.length === 0) return;
  const rows = deltas.map((d) => ({
    topic_id: topicId,
    id: d.id,
    user_id: userId,
    ...(d.label !== undefined ? { label: d.label } : null),
    ...(d.summary !== undefined ? { summary: d.summary } : null),
    ...(d.g !== undefined ? { g: d.g } : null),
    ...(d.week !== undefined ? { week: d.week } : null),
    ...(d.x !== undefined ? { x: d.x } : null),
    ...(d.y !== undefined ? { y: d.y } : null),
    ...(d.isGap !== undefined ? { is_gap: d.isGap } : null),
    ...(d.state !== undefined ? { state: d.state } : null),
    ...(d.shakyReason !== undefined ? { shaky_reason: d.shakyReason } : null),
    ...(d.reviewed !== undefined ? { reviewed: d.reviewed } : null),
    ...(d.consumeProgress !== undefined ? { consume_progress: d.consumeProgress } : null),
    ...(d.socraticProgress !== undefined ? { socratic_progress: d.socraticProgress } : null),
    ...(d.feynmanProgress !== undefined ? { feynman_progress: d.feynmanProgress } : null),
    ...(d.connectProgress !== undefined ? { connect_progress: d.connectProgress } : null),
  }));
  const { error } = await db.from("nodes").upsert(rows, { onConflict: "topic_id,id" });
  if (error) fail("applyNodeDeltas", error);

  const edges = deltas.flatMap((d) =>
    (d.prereqs ?? []).map((from) => ({
      topic_id: topicId,
      from_id: from,
      to_id: d.id,
      user_id: userId,
      dashed: false,
    })),
  );
  if (edges.length) {
    const { error: edgeError } = await db
      .from("edges")
      .upsert(edges, { onConflict: "topic_id,from_id,to_id", ignoreDuplicates: true });
    if (edgeError) fail("applyNodeDeltas/edges", edgeError);
  }
}

/** Remove nodes and every edge touching them — a resolved gap leaving the map.
 *  Two statements rather than a cascade: `edges` hangs off the topic, not off
 *  the node, because an edge outlives either endpoint being re-planned. */
export async function deleteNodes(
  db: SupabaseClient,
  topicId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.from("nodes").delete().eq("topic_id", topicId).in("id", ids);
  if (error) fail("deleteNodes", error);
  for (const column of ["from_id", "to_id"] as const) {
    const { error: edgeError } = await db
      .from("edges")
      .delete()
      .eq("topic_id", topicId)
      .in(column, ids);
    if (edgeError) fail("deleteNodes/edges", edgeError);
  }
}

// ------------------------------------------------------------------ cards --

const cardRow = (userId: string, topicId: string, card: StoredCard) => {
  const { id, nodeId, type, source, fsrs, ...content } = card;
  return {
    topic_id: topicId,
    id,
    user_id: userId,
    node_id: nodeId,
    type,
    source,
    content,
    fsrs,
    due: fsrs.due,
  };
};

/**
 * Write cards. One graded card is one row — the deck used to be re-serialized
 * and re-uploaded in full on every grade, which is what
 * `docs/ios-audit/06-review-calibration.md` flagged as the scaling problem.
 *
 * Upsert on the card's own id so a phase redone (Connect re-confirming the same
 * link) rewrites in place instead of stacking a duplicate with a fresh
 * scheduler state.
 */
export async function putCards(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cards: StoredCard[],
): Promise<void> {
  if (cards.length === 0) return;
  const { error } = await db
    .from("cards")
    .upsert(
      cards.map((c) => cardRow(userId, topicId, c)),
      { onConflict: "topic_id,id" },
    );
  if (error) fail("putCards", error);
}

/** Grade one card through the real scheduler and store the result.
 *
 *  The scheduling itself is `gradeStoredCard` in lib/fsrs.ts — the same
 *  function the browser calls locally. That is what makes the two clients
 *  agree on a due date: not a second implementation kept in step by hand, but
 *  one implementation reached two ways. */
export async function gradeCard(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cardId: string,
  grade: ReviewGrade,
  now: Date = new Date(),
): Promise<StoredCard | null> {
  const { data, error } = await db
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("topic_id", topicId)
    .eq("id", cardId)
    .maybeSingle();
  if (error) fail("gradeCard", error);
  if (!data) return null;
  const row = data as CardRow;
  const card = {
    id: row.id,
    nodeId: row.node_id,
    type: row.type,
    source: row.source,
    ...(row.content as Partial<StoredCard>),
    fsrs: row.fsrs,
  } as StoredCard;
  const next = gradeStoredCard(card, grade, now);
  await putCards(db, userId, topicId, [next]);
  return next;
}

export async function deleteCards(
  db: SupabaseClient,
  topicId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from("cards")
    .delete()
    .eq("topic_id", topicId)
    .in("id", ids);
  if (error) fail("deleteCards", error);
}

// ----------------------------------------------------------- node content --

/** Where a generated payload lives, as a screen asks for it. */
export interface ContentAddress {
  nodeId: string;
  kind: string;
  variant?: string;
}

export interface ContentRow extends ContentAddress {
  variant: string;
  cacheKey: string | null;
  payload: unknown;
}

export async function readContentRows(
  db: SupabaseClient,
  topicId: string,
  addresses: ContentAddress[],
): Promise<ContentRow[]> {
  let query = db
    .from("node_content")
    .select("node_id, kind, variant, cache_key, payload")
    .eq("topic_id", topicId);
  // An empty address list means "everything this topic has" — what an offline
  // mirror asks for once. Otherwise narrow to the nodes and kinds requested,
  // which is what a screen about to open asks for.
  if (addresses.length) {
    const nodes = [...new Set(addresses.map((a) => a.nodeId))];
    const kinds = [...new Set(addresses.map((a) => a.kind))];
    query = query.in("node_id", nodes).in("kind", kinds);
  }
  const { data, error } = await query;
  if (error) fail("readContentRows", error);
  return ((data ?? []) as Array<{
    node_id: string;
    kind: string;
    variant: string;
    cache_key: string | null;
    payload: unknown;
  }>).map((r) => ({
    nodeId: r.node_id,
    kind: r.kind,
    variant: r.variant,
    cacheKey: r.cache_key,
    payload: r.payload,
  }));
}

/**
 * Record that this topic has this payload.
 *
 * Written by the generate route, never by a client: the moment content exists
 * — freshly generated or served from the shared cache — it belongs to the
 * topic, on the server, with no upload. That is what retired the `caches`
 * column and its 4-second debounce.
 *
 * `cacheKey` is preferred over `payload`: the shared `content_cache` already
 * holds the bytes once for every learner, so a pointer is all a topic needs.
 * A kind without a stable key stores its payload here instead.
 */
export async function putContent(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  at: ContentAddress,
  content: { cacheKey?: string; payload?: unknown },
): Promise<void> {
  const { error } = await db.from("node_content").upsert(
    {
      topic_id: topicId,
      node_id: at.nodeId,
      kind: at.kind,
      variant: at.variant ?? "",
      user_id: userId,
      cache_key: content.cacheKey ?? null,
      payload: content.cacheKey ? null : (content.payload ?? null),
    },
    { onConflict: "topic_id,node_id,kind,variant" },
  );
  if (error) fail("putContent", error);
}
