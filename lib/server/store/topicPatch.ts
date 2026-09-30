// A topic's learner-owned fields, and the axes a learner may set on it: the
// target language's variant (W1.1), the lens (W2.6), the target (W5.1). The
// axes the map writes about itself are stamped by the server instead
// (`stampTopicMeta`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { asLanguageTag } from "@/lib/curriculum";
import { AtlasError } from "@/lib/errors";
import { fail } from "@/lib/server/store/shared";
import { ownsContinent } from "@/lib/server/store/continents";
import type { TopicPatch } from "@/lib/persistence";

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
    // A variant of the language the map already teaches — never a new one.
    ...(patch.targetLanguage !== undefined
      ? { target_language: asLanguageTag(patch.targetLanguage) }
      : null),
    ...(patch.lens !== undefined ? { lens: patch.lens?.slice(0, 80) || null } : null),
    ...(patch.target !== undefined ? { target: asTarget(patch.target) } : null),
  };
  if (Object.keys(row).length === 0) return;
  await continentIsMine(db, patch.continentId);
  const { error } = await db.from("topics").update(row).eq("id", id);
  if (error) fail("patchTopic", error);
}

/** A foreign key ignores RLS, so a topic could otherwise join a continent
 *  that is somebody else's. `null` (leaving one) needs no check. */
export async function continentIsMine(db: SupabaseClient, id: string | null | undefined) {
  if (id && !(await ownsContinent(db, id)))
    throw new AtlasError("invalid", "continentId: not the caller's continent");
}

/** W5.1: what the learner will be able to do, and how it will be known. */
function asTarget(raw: TopicPatch["target"]) {
  if (!raw || typeof raw !== "object") return null;
  const kinds = ["exam", "conversation", "teach", "behaviour", "build"];
  if (!kinds.includes(raw.kind)) return null;
  return {
    kind: raw.kind,
    text: String(raw.text ?? "").slice(0, 400),
    ...(raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? { date: raw.date } : null),
  };
}
