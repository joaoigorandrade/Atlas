// Coarse run-state persistence (§17): one `run_states` row per (user, subject)
// holding the whole run as a JSON snapshot — graph, mastery StateMap,
// adherence, calibration, the persisted FSRS card store, and the
// generated-content caches. RLS on the table keeps rows per-user; the browser
// client writes directly with the publishable key.

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
  /** Per-node generated content — persisting it is what stops re-billing. */
  caches: {
    consume: Record<string, ConsumeChunk[]>;
    socratic: Record<string, SocraticStep[]>;
    feynman: Record<string, FeynmanBeat[]>;
    connect: Record<string, ElaborationContent>;
    crucible: Record<string, CrucibleContent>;
    retain: RetainContent | null;
  };
}

/** What may come back from the table: a v1, v2 or v3 snapshot. v1 predates
 *  cards/shakyReasons/reviewedNodes/examDate/lastDay; v2 predates the
 *  reading-first Consume rewrite, so its cached chunks are quiz-shaped. */
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
  caches: Omit<RunSnapshot["caches"], "consume"> & {
    consume: Record<string, LegacyConsumeChunk[]>;
  };
};

/** A pre-v3 cached chunk: one short body string, a prediction on every chunk,
 *  verdict copy hanging off the chunk, and no example or takeaway. */
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

/** Reshape a cached v2 reading pass into the current one. The old material is
 *  all we have — it stays short — but it renders, and it stops gating: only
 *  the first chunk keeps its prediction, and it keeps its verdict copy. */
export function migrateConsume(
  cached: Record<string, LegacyConsumeChunk[]>,
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
            steps: [c.alt.example],
          },
          takeaway: c.takeaway ?? c.alt.simpler,
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

/** Fill an older snapshot's gaps; a v3 passes through unchanged. */
function migrate(raw: LoadedSnapshot): RunSnapshot {
  return {
    ...raw,
    v: 3,
    form: { ...raw.form, examDate: raw.form.examDate ?? "" },
    adherence: { ...raw.adherence, lastDay: raw.adherence.lastDay ?? "" },
    shakyReasons: raw.shakyReasons ?? {},
    reviewedNodes: raw.reviewedNodes ?? [],
    cards: raw.cards ?? [],
    caches: { ...raw.caches, consume: migrateConsume(raw.caches?.consume) },
  };
}

/** Most recently touched run for the signed-in user, or null on a fresh account. */
export async function loadLatestRun(
  supabase: SupabaseClient,
): Promise<{ subject: string; snapshot: RunSnapshot } | null> {
  const { data, error } = await supabase
    .from("run_states")
    .select("subject, snapshot")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Loading saved run failed: ${error.message}`);
  const snapshot = data?.snapshot as LoadedSnapshot | undefined;
  if (!snapshot || ![1, 2, 3].includes(snapshot.v)) return null;
  return { subject: data!.subject, snapshot: migrate(snapshot) };
}

/** Write-through upsert; `user_id` defaults to `auth.uid()` server-side. */
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
