// Review's own calls: a grade, its undo, and a suspension. Split from
// `lib/persistence.ts` (the run's wire contract), on the same `call` client.
// Each is server-owned state, so none of them rides the debounced card diff.

import type { ReviewGrade } from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import { call } from "@/lib/persistence";

/** Take cards out of rotation, or put them back. Server-owned, so not part of
 *  the card diff: it goes the moment the learner asks. */
export function suspendCards(id: string, ids: string[], suspended: boolean) {
  return call<{ ok: true }>("suspendCards", `/topics/${id}/cards`, {
    method: "PATCH",
    body: { ids, suspended },
  });
}

/** One grade, as the server takes it — see `POST /review`. */
export interface GradeRequest {
  cardId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  durationMs?: number;
  /** The rep count of the copy that was graded — a stale copy is refused. */
  expectReps: number;
}

export function postGrade(
  id: string,
  body: GradeRequest,
  keepalive = false,
): Promise<{ card: StoredCard; conflict?: boolean; leech?: boolean }> {
  return call("postGrade", `/topics/${id}/review`, {
    method: "POST",
    body,
    keepalive,
  });
}

/** Take back a card's latest review on the server. */
export function undoGradeRemote(
  id: string,
  cardId: string,
  keepalive = false,
): Promise<{ card: StoredCard }> {
  return call("undoGrade", `/topics/${id}/review`, {
    method: "DELETE",
    body: { cardId },
    keepalive,
  });
}
