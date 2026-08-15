// The background warm queue: the client half of "no screen should wait on a
// model". Content for the phases a learner is about to reach is fetched while
// they read the current one, so entering the next screen is a state change
// rather than a round-trip.
//
// The one rule that makes this safe is deduplication by key. A background warm
// and the click that beats it to the punch share a single in-flight promise —
// clicking through early costs the remainder of a request already running,
// never a second generation, and never a second charge. A foreground caller
// arriving while the warm is still queued promotes it and starts it at once.

/** Concurrent background requests. Two keeps the next two phases moving
 *  without competing with a foreground generation for the model's attention. */
const MAX_CONCURRENT = 2;

type Task = () => Promise<unknown>;

interface Entry {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  task: Task;
  state: "queued" | "running" | "done";
}

export interface WarmQueue {
  /**
   * Run (or join) the task at `key`. The same key returns the same promise, so
   * a foreground caller never duplicates a warm already in flight. Foreground
   * calls skip the queue; background calls wait for a slot.
   */
  run<T>(key: string, task: () => Promise<T>, foreground?: boolean): Promise<T>;
  /** Fire-and-forget warm. Errors are swallowed — nobody is watching. */
  warm(key: string, task: Task): void;
  /** Already in flight, or finished successfully this run. */
  has(key: string): boolean;
  /** Forget a key so it can be warmed again (its inputs changed). */
  drop(key: string): void;
  /** Drop everything — a new map invalidates every key. */
  clear(): void;
  /**
   * Stop dispatching queued warms. Anything already running is left alone —
   * cancelling an in-flight generation would waste the model call that was
   * already paid for, and it may well land.
   *
   * This is what the offline state drives. Without it, losing the network means
   * the queue burns through every warm it has, each failing instantly, dropping
   * its key and taking the deduplication with it — so the reconnect is followed
   * by a stampede of regenerations for content that was nearly ready.
   */
  suspend(): void;
  /** Resume dispatching. Queued warms pick up where they left off. */
  resume(): void;
}

/** Schedule background work off the critical path where the browser allows. */
function whenIdle(fn: () => void): void {
  if (typeof window === "undefined") {
    fn();
    return;
  }
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 2000 });
  else window.setTimeout(fn, 120);
}

export function createWarmQueue(): WarmQueue {
  const entries = new Map<string, Entry>();
  const queue: string[] = [];
  let active = 0;
  let suspended = false;

  /** Start `entry` now, settling its shared promise when the task lands. */
  function start(key: string, entry: Entry): void {
    entry.state = "running";
    active++;
    entry.task().then(
      (value) => {
        entry.state = "done";
        entry.resolve(value);
        active--;
        pump();
      },
      (error: unknown) => {
        // A failed attempt leaves no trace: drop the key so a later click can
        // retry and surface the error properly instead of replaying it.
        entries.delete(key);
        entry.reject(error);
        active--;
        pump();
      },
    );
  }

  function pump(): void {
    if (suspended) return;
    while (active < MAX_CONCURRENT && queue.length > 0) {
      const key = queue.shift()!;
      const entry = entries.get(key);
      // Dropped, or promoted to foreground, while it sat in the queue.
      if (!entry || entry.state !== "queued") continue;
      start(key, entry);
    }
  }

  function run<T>(key: string, task: () => Promise<T>, foreground = false): Promise<T> {
    // A foreground call is a learner waiting on a screen, so it starts even
    // while the background queue is held — being offline is a reason not to
    // speculate, never a reason to refuse what was actually asked for. It fails
    // fast and surfaces properly if there really is no network.
    const existing = entries.get(key);
    if (existing) {
      // Someone is waiting on a warm that hasn't started — start it now.
      if (foreground && existing.state === "queued") {
        const at = queue.indexOf(key);
        if (at >= 0) queue.splice(at, 1);
        start(key, existing);
      }
      return existing.promise as Promise<T>;
    }

    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // The shared promise is always consumed by `run`'s caller; the queue's own
    // rejection path is handled in `start`, so it never goes unobserved.
    promise.catch(() => undefined);

    const entry: Entry = {
      promise,
      resolve,
      reject,
      task: task as Task,
      state: "queued",
    };
    entries.set(key, entry);

    if (foreground) start(key, entry);
    else {
      queue.push(key);
      whenIdle(pump);
    }
    return promise as Promise<T>;
  }

  return {
    run,
    warm(key, task) {
      if (entries.has(key)) return;
      void run(key, task).catch(() => undefined);
    },
    has: (key) => entries.has(key),
    drop(key) {
      entries.delete(key);
      const at = queue.indexOf(key);
      if (at >= 0) queue.splice(at, 1);
    },
    clear() {
      // `active` is left alone on purpose: tasks already running still
      // decrement it when they land, and zeroing it here would go negative.
      entries.clear();
      queue.length = 0;
    },
    suspend() {
      suspended = true;
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      pump();
    },
  };
}
