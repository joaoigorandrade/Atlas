"use client";

// Grades on their way to the server.
//
// The browser grades a card locally the moment it is answered — the in-pass
// requeue and the next card's buttons need the new state now, not after a
// round trip — but the store's copy is the server's to write (`POST /review`).
// The card diff used to carry the browser's scheduler state up with every
// other field, which let a tab loaded this morning overwrite a review the
// phone made at noon. Now a grade travels as a grade, and the server refuses
// one computed from a copy it has since moved past.
//
// One queue, sent strictly in order (an undo must land after the grade it
// takes back), mirrored to localStorage so a grade answered offline, or as the
// tab closed, is sent on the next load instead of lost.

import { AtlasError, toAtlasError } from "@/lib/errors";
import type { StoredCard } from "@/lib/fsrs";
import { postGrade, undoGradeRemote, type GradeRequest } from "@/lib/reviewApi";
import { logWarning } from "@/lib/log";

export type GradeOp =
  | ({ kind: "grade"; topicId: string; tries?: number } & GradeRequest)
  | { kind: "undo"; topicId: string; cardId: string; tries?: number };

const STORE_KEY = "atlas:pending-grades";
/** A card the server has not heard of yet is usually one still on its way up
 *  in the card diff; give it this many more goes before letting the grade go. */
const NOT_FOUND_TRIES = 3;
const NOT_FOUND_WAIT_MS = 2500;

function readStored(): GradeOp[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const ops = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ops) ? (ops as GradeOp[]) : [];
  } catch {
    return [];
  }
}

function writeStored(ops: GradeOp[]): void {
  try {
    if (ops.length) localStorage.setItem(STORE_KEY, JSON.stringify(ops));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Private mode, or storage full: the queue still runs in memory.
  }
}

export interface GradeSync {
  push: (op: GradeOp) => void;
  /** Send what is queued. `keepalive` when the page is going away. */
  flush: (keepalive?: boolean) => void;
  dispose: () => void;
}

/**
 * The queue. `adopt` receives the server's card whenever it overrules the
 * local copy — a refused (stale) grade, or an undo's restored state.
 */
export function createGradeSync(
  adopt: (topicId: string, card: StoredCard) => void,
): GradeSync {
  let queue: GradeOp[] = readStored();
  let running = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const send = (op: GradeOp, keepalive: boolean) => {
    if (op.kind === "undo") return undoGradeRemote(op.topicId, op.cardId, keepalive);
    const { kind: _kind, topicId, tries: _tries, ...body } = op;
    return postGrade(topicId, body, keepalive);
  };

  const flush = (keepalive = false) => {
    if (running || queue.length === 0) return;
    running = true;
    void (async () => {
      try {
        while (queue.length) {
          const op = queue[0];
          try {
            const res = await send(op, keepalive);
            if (op.kind === "undo" || ("conflict" in res && res.conflict))
              adopt(op.topicId, res.card);
          } catch (err) {
            const e: AtlasError = toAtlasError(err);
            if (e.code === "notfound" && (op.tries ?? 0) < NOT_FOUND_TRIES) {
              queue[0] = { ...op, tries: (op.tries ?? 0) + 1 };
              writeStored(queue);
              clearTimeout(retryTimer);
              retryTimer = setTimeout(() => flush(), NOT_FOUND_WAIT_MS);
              return;
            }
            // Offline, or the server is down: keep it, try on the next push,
            // the next `online`, or the next load.
            // (`auth` included: the session refreshes and the next try lands.)
            if (e.retryable || e.code === "offline" || e.code === "auth") return;
            // Refused for good (a card deleted since, a malformed op): drop it
            // rather than wedge every grade behind it.
            logWarning("grade_sync_dropped", e, { kind: op.kind, card: op.cardId });
          }
          queue = queue.slice(1);
          writeStored(queue);
        }
      } finally {
        running = false;
      }
    })();
  };

  const onOnline = () => flush();
  const onHide = () => {
    if (document.visibilityState === "hidden") flush(true);
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onHide);

  return {
    push: (op) => {
      queue = [...queue, op];
      writeStored(queue);
      flush();
    },
    flush,
    dispose: () => {
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
    },
  };
}
