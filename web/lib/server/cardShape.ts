// What a card write must look like before it reaches the store.
//
// The cards route used to check only that each card had an id, so a client
// with a bug could file a card with no back, an unknown type or a 50 kB front,
// and every screen that dealt it afterwards had to survive it. Checked here,
// once, at the door.

import type { StoredCard } from "@/lib/fsrs";

const TYPES = new Set(["recall", "why", "apply"]);
const ID_MAX = 200;
const SOURCE_MAX = 40;
const TEXT_MAX = 4000;

const text = (v: unknown, max = TEXT_MAX) =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const optionalText = (v: unknown) => v === undefined || v === null || text(v);

/** The scheduler state a client may mint a new card with: dated, and with
 *  the numbers ts-fsrs reads actually numbers. */
function plausibleFsrs(v: unknown): boolean {
  if (v === undefined || v === null) return true; // the server starts it
  if (typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  if (typeof f.due !== "string" || !Number.isFinite(Date.parse(f.due))) return false;
  return ["stability", "difficulty", "reps", "lapses", "state"].every(
    (k) => typeof f[k] === "number" && Number.isFinite(f[k]),
  );
}

/** Why this card is refused, or null when it may be written. */
export function cardProblem(card: unknown): string | null {
  if (!card || typeof card !== "object") return "card_shape";
  const c = card as Partial<Record<keyof StoredCard, unknown>>;
  if (!text(c.id, ID_MAX) || !text(c.nodeId, ID_MAX)) return "card_shape";
  if (typeof c.type !== "string" || !TYPES.has(c.type)) return "card_type";
  if (!text(c.source, SOURCE_MAX)) return "card_source";
  if (!text(c.back)) return "card_back";
  if (![c.front, c.answer, c.reExplain].every(optionalText)) return "card_text";
  if (
    c.cloze !== undefined &&
    c.cloze !== null &&
    !(
      Array.isArray(c.cloze) &&
      c.cloze.length === 2 &&
      c.cloze.every((s) => typeof s === "string" && s.length <= TEXT_MAX)
    )
  )
    return "card_cloze";
  if (!c.front && !c.cloze) return "card_front";
  if (!plausibleFsrs(c.fsrs)) return "card_fsrs";
  return null;
}
