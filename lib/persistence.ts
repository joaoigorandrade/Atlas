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
import type {
  AdherenceState,
  CalibSample,
  ConceptGraph,
  ConsumeChunk,
  CrucibleContent,
  ElaborationContent,
  FeynmanBeat,
  OnboardingForm,
  RetainContent,
  ShakyReason,
  SocraticStep,
  StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";

/** Per-node generated content. Also lives in the shared `content_cache` table
 *  keyed by prompt hash — this copy is the learner's own instant-resume set. */
export interface RunCaches {
  consume: Record<string, ConsumeChunk[]>;
  socratic: Record<string, SocraticStep[]>;
  feynman: Record<string, FeynmanBeat[]>;
  connect: Record<string, ElaborationContent>;
  crucible: Record<string, CrucibleContent>;
  retain: RetainContent | null;
}

export const emptyCaches = (): RunCaches => ({
  consume: {},
  socratic: {},
  feynman: {},
  connect: {},
  crucible: {},
  retain: null,
});

export interface RunSnapshot {
  v: 3;
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
}

/** What may come back from the table: a v1, v2, or v3 snapshot. v1 predates
 *  cards/shakyReasons/reviewedNodes/examDate/lastDay; v1 and v2 carry the
 *  content caches inline, which v3 moved to their own column. */
type LoadedSnapshot = Omit<
  RunSnapshot,
  "v" | "form" | "adherence" | "shakyReasons" | "reviewedNodes" | "cards" | "caches"
> & {
  v: number;
  form: Omit<OnboardingForm, "examDate"> & { examDate?: string };
  adherence: Omit<AdherenceState, "lastDay"> & { lastDay?: string };
  shakyReasons?: Record<string, ShakyReason>;
  reviewedNodes?: string[];
  cards?: StoredCard[];
  caches?: Partial<RunCaches>;
};

/** Fill an older snapshot's gaps; a v3 passes through unchanged. */
function migrate(raw: LoadedSnapshot): RunSnapshot {
  const { caches: _inline, ...rest } = raw;
  return {
    ...rest,
    v: 3,
    form: { ...raw.form, examDate: raw.form.examDate ?? "" },
    adherence: { ...raw.adherence, lastDay: raw.adherence.lastDay ?? "" },
    shakyReasons: raw.shakyReasons ?? {},
    reviewedNodes: raw.reviewedNodes ?? [],
    cards: raw.cards ?? [],
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
};

/** Reshape a quiz-shaped reading pass into the current one. Detected by shape,
 *  not by snapshot version: these chunks live in their own column now, and a
 *  row written by the previous deploy carries no version of its own. The old
 *  material is all we have — it stays short — but it renders, and it stops
 *  gating: only the first chunk keeps its prediction, and its verdict copy
 *  moves onto it. */
export function migrateConsume(
  cached: Record<string, LegacyConsumeChunk[]> | undefined,
): Record<string, ConsumeChunk[]> {
  return Object.fromEntries(
    Object.entries(cached ?? {}).map(([nodeId, chunks]) => [
      nodeId,
      chunks.map((c, i) => {
        const { right, wrong, pred, ...rest } = c;
        return {
          ...rest,
          body: Array.isArray(c.body) ? c.body : [c.body],
          example: c.example ?? {
            title: "Worked through",
            steps: [c.alt?.example ?? "See the passage above."],
          },
          takeaway: c.takeaway ?? c.alt?.simpler ?? "",
          ...(i === 0 && pred
            ? {
                pred: {
                  ...pred,
                  right: pred.right ?? right ?? "That matches what follows.",
                  wrong:
                    pred.wrong ??
                    wrong ??
                    "Not quite — the section below sets it straight.",
                },
              }
            : null),
        };
      }),
    ]),
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
  if (error) throw new Error(`Loading saved run failed: ${error.message}`);
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
  if (error) throw new Error(`Loading saved run failed: ${error.message}`);
  return toLoadedRun(data);
}

function toLoadedRun(
  data: { subject: string; snapshot: unknown } | null,
): LoadedRun | null {
  const snapshot = data?.snapshot as LoadedSnapshot | undefined;
  if (!snapshot || ![1, 2, 3].includes(snapshot.v)) return null;
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
  if (error) throw new Error(`Loading your maps failed: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const snapshot = row.snapshot as LoadedSnapshot | undefined;
    if (!snapshot || ![1, 2, 3].includes(snapshot.v)) return [];
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
  if (error) throw new Error(`Loading saved content failed: ${error.message}`);
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
  if (error) throw new Error(`Saving run failed: ${error.message}`);
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
  if (error) throw new Error(`Removing the topic failed: ${error.message}`);
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
  if (error) throw new Error(`Saving content failed: ${error.message}`);
}
