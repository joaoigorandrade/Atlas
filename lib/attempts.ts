// The attempts log (W0.2): one row per phase close, pass or fail, never
// overwritten — unlike `phase_progress`, which holds only the latest pass.
// It is what the durability, stay and phase-effectiveness numbers are read
// from, so it is fire-and-forget: a lost row costs a data point, never a screen.

import type { PhaseId } from "@/lib/curriculum";
import { generationTopic } from "@/lib/generationTopic";

export interface Attempt {
  nodeId: string;
  phase: PhaseId;
  passed: boolean;
  /** The phase's own score, 0–1, where it has one. */
  score?: number;
  /** The phase's own shape of result: `{ overIncluded: 1 }`, `{ brokeAt: 2 }`. */
  detail?: Record<string, unknown>;
}

export function recordAttempt(a: Attempt): void {
  const topicId = generationTopic();
  if (!topicId) return;
  void fetch(`/api/v1/topics/${topicId}/attempts`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(a),
  }).catch(() => {});
}
