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
  v: 2;
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

/** What may come back from the table: a v1 or v2 snapshot (v1 predates
 *  cards/shakyReasons/reviewedNodes/examDate/lastDay). */
type LoadedSnapshot = Omit<
  RunSnapshot,
  "v" | "form" | "adherence" | "shakyReasons" | "reviewedNodes" | "cards"
> & {
  v: number;
  form: Omit<OnboardingForm, "examDate"> & { examDate?: string };
  adherence: Omit<AdherenceState, "lastDay"> & { lastDay?: string };
  shakyReasons?: Record<string, ShakyReason>;
  reviewedNodes?: string[];
  cards?: StoredCard[];
};

/** Fill a v1 snapshot's gaps; a v2 passes through unchanged. */
function migrate(raw: LoadedSnapshot): RunSnapshot {
  return {
    ...raw,
    v: 2,
    form: { ...raw.form, examDate: raw.form.examDate ?? "" },
    adherence: { ...raw.adherence, lastDay: raw.adherence.lastDay ?? "" },
    shakyReasons: raw.shakyReasons ?? {},
    reviewedNodes: raw.reviewedNodes ?? [],
    cards: raw.cards ?? [],
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
  if (!snapshot || (snapshot.v !== 1 && snapshot.v !== 2)) return null;
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
