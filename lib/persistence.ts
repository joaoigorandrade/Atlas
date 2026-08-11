// Coarse per-(user, subject) run persistence (§17), split in two so the map
// never waits on content it isn't rendering:
//
//   run_states.snapshot — the run core: graph, mastery StateMap, positions,
//     adherence, calibration, the FSRS card store. Small, changes constantly,
//     saved on a short debounce. This is all the map needs to draw.
//   run_states.caches   — the per-node generated content. Large, changes only
//     after a generation, loaded in the background and saved on a long
//     debounce so a node drag no longer re-uploads megabytes of chunks.
//
// RLS on the table keeps rows per-user; the browser client writes directly
// with the publishable key.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AtlasError } from "@/lib/errors";
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
  OnboardingForm,
  RetainContent,
  ShakyReason,
  SocraticSession,
  SocraticStep,
  StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";

/** Per-node generated content. Also lives in the shared `content_cache` table
 *  keyed by prompt hash — this copy is the learner's own instant-resume set. */
export interface RunCaches {
  consume: Record<string, ConsumeChunk[]>;
  /** Lens views already opened, keyed `model:<nodeId>:<chunkId>:<lens>` — a
   *  learner who re-enters a pass reopens the walkthrough they read, not a
   *  freshly written one. */
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

export interface RunSnapshot {
  v: 8;
  form: OnboardingForm;
  graph: ConceptGraph;
  /** Gap-node ids spawned by re-planning (a Set in memory). */
  spawnedIds: string[];
  states: StateMap;
  positions: Record<string, { x: number; y: number }>;
  adherence: AdherenceState;
  calibSamples: CalibSample[];
  litToday: string[];
  /** How each Shaky node got that way — honest confidence copy (#14). */
  shakyReasons: Record<string, ShakyReason>;
  /** Nodes with at least one review graded good+ — gates Retained ✓ (#13). */
  reviewedNodes: string[];
  /** The persisted FSRS card store (#21) — real due dates survive refreshes. */
  cards: StoredCard[];
  /** Where the learner got to in each node's reading pass (§6). The reading is
   *  the longest surface in the app; losing your place in it on a refresh is
   *  the difference between a document and somewhere you can leave. */
  consumeProgress: Record<string, ConsumeProgress>;
  /** How often each lens has been opened, run-wide — the evidence behind the
   *  adaptive-modality preference. */
  modalityTally: ModalityTally;
  /** The unfinished questioning pass on each node (§3a) — same reason the
   *  reading keeps its place: a session left half-answered is somewhere to
   *  come back to, not a transcript to re-earn. Finished passes drop out. */
  socraticProgress: Record<string, SocraticSession>;
  /** The unfinished teach-back on each node (§3b) — including one parked on
   *  its Gap Report, whose gaps haven't been carried to the map yet. Dropped
   *  once they have. */
  feynmanProgress: Record<string, FeynmanSession>;
  /** The unfinished elaboration pass on each node (§4) — the confirmed links
   *  and the drafts behind them. Same reason as the two above: stepping back
   *  to the map used to throw away every connection the learner had just
   *  written. Dropped once the phase finishes. */
  connectProgress: Record<string, ConnectSession>;
  /** What this learner keeps getting wrong, run-wide (§3a). Unlike the passes
   *  above — dropped the moment one finishes — this outlives every session,
   *  because "you keep confusing X and Y" is the one thing a tutor can only
   *  learn by having been there before. */
  misconceptions: MisconceptionRecord[];
}

/** What may come back from the table: a v1 … v8 snapshot. v1 predates
 *  cards/shakyReasons/reviewedNodes/examDate/lastDay; v1 and v2 carry the
 *  content caches inline, which v3 moved to their own column; v4 adds the
 *  Consume reading progress and the modality tally; v5 the Socratic one; v6
 *  the run-wide misconception roll-up; v7 the Feynman one; v8 the Connect one. */
type LoadedSnapshot = Omit<
  RunSnapshot,
  | "v"
  | "form"
  | "adherence"
  | "shakyReasons"
  | "reviewedNodes"
  | "cards"
  | "caches"
  | "consumeProgress"
  | "modalityTally"
  | "socraticProgress"
  | "feynmanProgress"
  | "connectProgress"
  | "misconceptions"
> & {
  v: number;
  form: Omit<OnboardingForm, "examDate"> & { examDate?: string };
  adherence: Omit<AdherenceState, "lastDay"> & { lastDay?: string };
  shakyReasons?: Record<string, ShakyReason>;
  reviewedNodes?: string[];
  cards?: StoredCard[];
  caches?: Partial<RunCaches>;
  consumeProgress?: Record<string, ConsumeProgress>;
  modalityTally?: ModalityTally;
  socraticProgress?: Record<string, SocraticSession>;
  feynmanProgress?: Record<string, FeynmanSession>;
  connectProgress?: Record<string, ConnectSession>;
  misconceptions?: MisconceptionRecord[];
};

/** Every snapshot version this loader accepts. */
const SNAPSHOT_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Fill an older snapshot's gaps; a v8 passes through unchanged. */
function migrate(raw: LoadedSnapshot): RunSnapshot {
  const { caches: _inline, ...rest } = raw;
  return {
    ...rest,
    v: 8,
    form: { ...raw.form, examDate: raw.form.examDate ?? "" },
    adherence: { ...raw.adherence, lastDay: raw.adherence.lastDay ?? "" },
    shakyReasons: raw.shakyReasons ?? {},
    reviewedNodes: raw.reviewedNodes ?? [],
    cards: raw.cards ?? [],
    // A pre-v4 run has read passes it can't prove it read. Empty is the honest
    // answer: the map under-claims rather than inventing a position.
    consumeProgress: raw.consumeProgress ?? {},
    modalityTally: raw.modalityTally ?? {},
    socraticProgress: raw.socraticProgress ?? {},
    feynmanProgress: raw.feynmanProgress ?? {},
    connectProgress: raw.connectProgress ?? {},
    misconceptions: raw.misconceptions ?? [],
  };
}

/** A cached chunk from before the reading-first Consume rewrite: one short
 *  body string, a prediction on every chunk, verdict copy hanging off the
 *  chunk, and no example or takeaway. */
export type LegacyConsumeChunk = Omit<
  ConsumeChunk,
  "body" | "example" | "takeaway"
> & {
  body: string | string[];
  example?: ConsumeChunk["example"];
  takeaway?: string;
  right?: string;
  wrong?: string;
  pred?: unknown;
};

/** Reshape a quiz-shaped reading pass into the current one. Detected by shape,
 *  not by snapshot version: these chunks live in their own column now, and a
 *  row written by the previous deploy carries no version of its own. The old
 *  material is all we have — it stays short — but it renders, and it stops
 *  gating: the pre-reading prediction hook is dropped along with its verdict
 *  copy, since nothing renders it any more. */
export function migrateConsume(
  cached: Record<string, LegacyConsumeChunk[]> | undefined,
): Record<string, ConsumeChunk[]> {
  return Object.fromEntries(
    Object.entries(cached ?? {}).map(([nodeId, chunks]) => [
      nodeId,
      chunks.map((c) => {
        const { right: _right, wrong: _wrong, pred: _pred, ...rest } = c;
        return {
          ...rest,
          body: Array.isArray(c.body) ? c.body : [c.body],
          example: c.example ?? {
            title: "Worked through",
            steps: [c.alt?.example ?? "See the passage above."],
          },
          takeaway: c.takeaway ?? c.alt?.simpler ?? "",
        };
      }),
    ]),
  );
}

/** Teach-back rubrics written before the blank-page rewrite are scripts, not
 *  rubrics: a learner monologue and three canned replies, with nothing to grade
 *  an explanation against. There is no `mustConvey` to recover from them, so
 *  they are dropped and the node writes a fresh rubric on its next teach-back.
 *  Detected by shape, like the reading above: these rows carry no version. */
function usableRubrics(
  cached: Record<string, FeynmanBeat[]> | undefined,
): Record<string, FeynmanBeat[]> {
  return Object.fromEntries(
    Object.entries(cached ?? {}).filter(([, beats]) =>
      beats?.every((b) => Array.isArray(b?.mustConvey) && b.mustConvey.length),
    ),
  );
}

/** The one funnel every stored cache passes through — the separate column and
 *  a pre-v3 snapshot's inline copy alike. */
function normalizeCaches(raw: Partial<RunCaches> | null | undefined): RunCaches {
  const merged = { ...emptyCaches(), ...(raw ?? {}) };
  return {
    ...merged,
    consume: migrateConsume(
      merged.consume as unknown as Record<string, LegacyConsumeChunk[]>,
    ),
    feynman: usableRubrics(merged.feynman),
  };
}

export interface LoadedRun {
  subject: string;
  snapshot: RunSnapshot;
  /** Present only for pre-v3 rows, whose caches still travel inside the
   *  snapshot — nothing is lost on the first load after the migration. */
  inlineCaches: RunCaches | null;
}

/**
 * Every Postgres failure in this file, classified once.
 *
 * These used to throw ``new Error(`Saving run failed: ${error.message}`)`` — and
 * PostgREST's own prose travelled from there all the way into a toast, in
 * English, describing a schema the learner has never heard of. The `op` is kept
 * for the log line; what reaches a screen is chosen from the code.
 *
 * A Supabase client error carries no HTTP status, so the split is by shape: a
 * `fetch` that never left is the browser being offline, and anything else is
 * the service having a problem. Both are retryable, which is what
 * `lib/retry.ts` reads.
 */
function storageError(op: string, error: { message: string }): AtlasError {
  const offline =
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine;
  return new AtlasError(
    offline ? "offline" : "upstream",
    `${op} failed: ${error.message}`,
    { reason: op },
  );
}

/**
 * The run core for the most recently touched run, without the content caches.
 * This is the query the first paint waits on, so it stays small on purpose.
 */
export async function loadRunCore(
  supabase: SupabaseClient,
): Promise<LoadedRun | null> {
  const { data, error } = await supabase
    .from("run_states")
    .select("subject, snapshot")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw storageError("load", error);
  return toLoadedRun(data);
}

/** The run core for one named subject — switching onto a non-default map. */
export async function loadRunBySubject(
  supabase: SupabaseClient,
  subject: string,
): Promise<LoadedRun | null> {
  const { data, error } = await supabase
    .from("run_states")
    .select("subject, snapshot")
    .eq("subject", subject)
    .maybeSingle();
  if (error) throw storageError("load", error);
  return toLoadedRun(data);
}

function toLoadedRun(
  data: { subject: string; snapshot: unknown } | null,
): LoadedRun | null {
  const snapshot = data?.snapshot as LoadedSnapshot | undefined;
  if (!snapshot || !SNAPSHOT_VERSIONS.includes(snapshot.v)) return null;
  return {
    subject: data!.subject,
    snapshot: migrate(snapshot),
    inlineCaches: snapshot.caches ? normalizeCaches(snapshot.caches) : null,
  };
}

/** A dashboard-card's worth of a run — just enough to derive mastery %, the
 *  frontier count and the goal label, without the (large) generated caches. */
export interface RunSummary {
  subject: string;
  goal: OnboardingForm["goal"];
  graph: ConceptGraph;
  states: StateMap;
}

/** Every saved run for the caller — RLS scopes it to their own rows. Powers
 *  the "Your maps" grid; the currently-open run isn't excluded, callers that
 *  already hold it live prefer their own (fresher) copy. */
export async function listRuns(
  supabase: SupabaseClient,
): Promise<RunSummary[]> {
  const { data, error } = await supabase
    .from("run_states")
    .select("subject, snapshot")
    .order("updated_at", { ascending: false });
  if (error) throw storageError("list", error);
  return (data ?? []).flatMap((row) => {
    const snapshot = row.snapshot as LoadedSnapshot | undefined;
    // Every version the loader accepts, not just the first three — a run saved
    // since v4 was silently missing from the grid.
    if (!snapshot || !SNAPSHOT_VERSIONS.includes(snapshot.v)) return [];
    return [
      {
        subject: row.subject as string,
        goal: snapshot.form.goal,
        graph: snapshot.graph,
        states: snapshot.states,
      },
    ];
  });
}

/** The generated content for a run — fetched after the map is already drawn. */
export async function loadRunCaches(
  supabase: SupabaseClient,
  subject: string,
): Promise<RunCaches> {
  const { data, error } = await supabase
    .from("run_states")
    .select("caches")
    .eq("subject", subject)
    .maybeSingle();
  if (error) throw storageError("loadCaches", error);
  return normalizeCaches(data?.caches as Partial<RunCaches> | undefined);
}

/** Write-through upsert of the run core; `user_id` defaults to `auth.uid()`. */
export async function saveRun(
  supabase: SupabaseClient,
  subject: string,
  snapshot: RunSnapshot,
): Promise<void> {
  const { error } = await supabase
    .from("run_states")
    .upsert({ subject, snapshot }, { onConflict: "user_id,subject" });
  if (error) throw storageError("save", error);
}

/**
 * Drop a run entirely — the learner excluding a topic from the dashboard.
 * Both halves live in the one row, so a single delete takes the map, the
 * mastery states, the cards and the generated content with it. RLS scopes the
 * match to the caller, so `subject` alone identifies the row.
 */
export async function deleteRun(
  supabase: SupabaseClient,
  subject: string,
): Promise<void> {
  const { error } = await supabase.from("run_states").delete().eq("subject", subject);
  if (error) throw storageError("delete", error);
}

/** Write-through upsert of the content caches alone — the big, rare write. */
export async function saveRunCaches(
  supabase: SupabaseClient,
  subject: string,
  caches: RunCaches,
): Promise<void> {
  const { error } = await supabase
    .from("run_states")
    .upsert({ subject, caches }, { onConflict: "user_id,subject" });
  if (error) throw storageError("saveCaches", error);
}
