// The browser's device mirror — the web half of `docs/CONTENT-STORAGE.md`
// rule 3. iOS keeps the same policy in SwiftData (`Data/Local/LocalStore.swift`);
// there is deliberately no shared code between the two, just the same five
// rules and four operations.
//
// Why `CacheStorage` and not IndexedDB or `localStorage`: a topic's content is
// literally one HTTP answer, and this is the platform's own store for those.
// One `put`, one `match`, no schema, no object stores, no migration, and
// megabytes of room where `localStorage` has a few. A shape change is a rename
// (`STORE` below), not a migration ladder — everything in here is re-fetchable.
//
// It is a cache and never a source of truth: every operation is a no-op when
// the store is unavailable (Safari private mode, an insecure origin, SSR), so
// a mirror that fails costs a round trip, never a screen.

import { generationTopic } from "@/lib/generationTopic";
import { logWarning } from "@/lib/log";
import {
  foldContent,
  loadContentItems,
  type ContentItem,
  type RunCaches,
} from "@/lib/persistence";

/** Bump to abandon everything stored under the old name. */
const STORE = "atlas-content-v1";

/** Not a real endpoint — `CacheStorage` keys on a URL, and this is the one
 *  this topic's answer is filed under. Same-origin so the key is stable. */
const at = (topicId: string): string => `/__atlas/content/${encodeURIComponent(topicId)}`;

/** The store, or null where the browser has none. */
async function store(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(STORE);
  } catch {
    // Private mode and disabled site data both land here. Not worth a log
    // line: it is the expected answer on those browsers, every single time.
    return null;
  }
}

/** What the mirror holds for this topic, or null when it holds nothing. */
export async function readMirror(topicId: string): Promise<ContentItem[] | null> {
  const cache = await store();
  if (!cache) return null;
  try {
    const hit = await cache.match(at(topicId));
    if (!hit) return null;
    const items = (await hit.json()) as ContentItem[];
    return Array.isArray(items) ? items : null;
  } catch (err) {
    logWarning("content_mirror_read_failed", err);
    return null;
  }
}

/** One item's address — the mirror's own identity for a row, and what makes
 *  a merge a merge. Same three parts as everywhere else: `nodeId|kind|variant`. */
const addressOf = (item: ContentItem): string =>
  `${item.nodeId}|${item.kind}|${item.variant ?? ""}`;

/**
 * Mirror what the server just sent — item for item, unmodified. Rebuilding
 * the answer from the folded caches would drop the fields only the *other*
 * client renders, which is the bug rule 3 exists to prevent.
 *
 * Merged onto what is already there, never a wholesale replace. Two callers
 * need that: a generation landing writes one item and must not erase the rest,
 * and a hydrate that comes back short — a shared row abandoned by a version
 * bump, a topic whose content the server could not resolve — must not take the
 * copy on this device with it. iOS has always merged (`LocalStore.save`); the
 * web replacing was the asymmetry.
 */
export function writeMirror(topicId: string, items: ContentItem[]): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  // One writer at a time per topic. A merge is a read, a modify and a write,
  // and the warm queue lands two generations at once by design — unserialized,
  // both read the same "before" and the second write threw the first one away.
  const next = (writing.get(topicId) ?? Promise.resolve()).then(() =>
    merge(topicId, items),
  );
  writing.set(topicId, next);
  return next;
}

/** The in-flight write per topic, so the next one queues behind it rather than
 *  racing it. Never rejects — every operation here is a no-op on error. */
const writing = new Map<string, Promise<void>>();

async function merge(topicId: string, items: ContentItem[]): Promise<void> {
  const cache = await store();
  if (!cache) return;
  try {
    const held = (await readMirror(topicId)) ?? [];
    const merged = new Map(held.map((item) => [addressOf(item), item]));
    // The incoming copy wins: it is the fresher answer for that address.
    for (const item of items) merged.set(addressOf(item), item);
    await cache.put(
      at(topicId),
      new Response(JSON.stringify([...merged.values()]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (err) {
    // Quota is the realistic failure. The app is unaffected — this is a cache.
    logWarning("content_mirror_write_failed", err);
  }
}

/**
 * One generation, to the mirror, as it lands.
 *
 * The second half of rule 3's "written on both paths". The web used to write
 * the mirror only when a hydrate landed, so everything read in a session was
 * absent from disk until the next load — the exact bug the rule names ("content
 * read on the phone yesterday was not there this morning"). iOS has had this as
 * `warm.onLanded` → `AtlasStore.mirror`; this is the same seam on this side.
 *
 * `payload` is what the screen renders, which is also what the content route
 * sends — the same shape, so a mirrored generation and a hydrated one are
 * indistinguishable on the way back in. It is stored as it arrived, never
 * rebuilt from the folded caches (rule 3.2).
 *
 * The topic comes from `generationTopic()` rather than an argument for the
 * reason the generate route's `topicId` does: it is a property of which map is
 * open, the same for every call, and threading it would touch every caller.
 */
export function mirrorItem(topicId: string, item: ContentItem): void {
  void writeMirror(topicId, [item]);
}

/**
 * A landed warm-queue value, to the mirror.
 *
 * The queue's key *is* the address — `lib/warm.ts` is the one place every
 * foreground generation and every background warm settles, so it is the one
 * place that sees content land whatever asked for it. The key spellings are the
 * web's own (`useGeneration`'s `warmKey` and `modelKey`); iOS parses its own
 * `nodeId|kind|variant` in `AtlasStore.mirror` for exactly this.
 *
 * Anything that is not a node's content is skipped: `summary` lands on the node
 * in the graph and is saved with the run, and `retain` drafts `cards` rows.
 */
const MIRRORED = new Set(["consume", "socratic", "feynman", "connect", "crucible"]);

export function mirrorLanded(key: string, value: unknown): void {
  const topicId = generationTopic();
  if (!topicId || value === undefined || value === null) return;
  const [kind, nodeId, ...rest] = key.split(":");
  // `model:<nodeId>:<chunkId>:<lens>` — the one kind with two payloads on one
  // node, and the only one whose variant is not empty.
  if (kind === "model") {
    if (!nodeId || rest.length < 2) return;
    mirrorItem(topicId, { nodeId, kind, variant: rest.join(":"), payload: value });
    return;
  }
  if (!MIRRORED.has(kind) || !nodeId || rest.length) return;
  mirrorItem(topicId, { nodeId, kind, variant: "", payload: value });
}

/** The local half of the server's cascade: a deleted topic takes its content. */
export async function dropMirror(topicId: string): Promise<void> {
  const cache = await store();
  if (!cache) return;
  try {
    await cache.delete(at(topicId));
  } catch (err) {
    logWarning("content_mirror_drop_failed", err);
  }
}

/** Everything. Sign-out clears it: the next person at this browser must not
 *  open somebody else's reading. */
export async function clearMirror(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(STORE);
  } catch (err) {
    logWarning("content_mirror_clear_failed", err);
  }
}

/**
 * A run's generated content: paint from the mirror, then revalidate.
 *
 * `apply` is called up to twice, and merging is what makes that safe — a cache
 * entry already in memory is the fresher one, so neither pass can take back
 * something generated since. Content at an address is immutable (a Crucible
 * redo is a new `variant`, not an overwrite), so the mirror can never shadow a
 * genuinely different answer.
 *
 * A network failure with the mirror painted is a refresh that did not land,
 * not something the learner has to be told about — the map is already drawn
 * and every phase still opens, from the shared `content_cache`, as a round
 * trip rather than a regeneration.
 */
export async function hydrateContent(
  topicId: string,
  apply: (caches: RunCaches) => void,
): Promise<void> {
  const mirrored = await readMirror(topicId);
  if (mirrored?.length) apply(foldContent(mirrored));
  try {
    const items = await loadContentItems(topicId);
    apply(foldContent(items));
    await writeMirror(topicId, items);
  } catch (err) {
    logWarning("load_content_failed", err);
  }
}
