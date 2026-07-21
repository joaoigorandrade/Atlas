// Coarse run-state persistence (§17): one `run_states` row per (user, subject)
// holding the whole run as a JSON snapshot — graph, mastery StateMap,
// adherence, calibration, and the generated-content caches. RLS on the table
// keeps rows per-user; the browser client writes directly with the
// publishable key. Normalize into real tables when FSRS lands.

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
  SocraticStep,
  StateMap,
} from "@/lib/curriculum";

export interface RunSnapshot {
  v: 1;
  form: OnboardingForm;
  graph: ConceptGraph;
  /** Gap-node ids spawned by re-planning (a Set in memory). */
  spawnedIds: string[];
  states: StateMap;
  positions: Record<string, { x: number; y: number }>;
  adherence: AdherenceState;
  calibSamples: CalibSample[];
  litToday: string[];
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
  if (!data || (data.snapshot as RunSnapshot).v !== 1) return null;
  return { subject: data.subject, snapshot: data.snapshot as RunSnapshot };
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
