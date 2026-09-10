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

/** Mirror what the server just sent — item for item, unmodified. Rebuilding
 *  the answer from the folded caches would drop the fields only the *other*
 *  client renders, which is the bug rule 3 exists to prevent. */
export async function writeMirror(topicId: string, items: ContentItem[]): Promise<void> {
  const cache = await store();
  if (!cache) return;
  try {
    await cache.put(
      at(topicId),
      new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (err) {
    // Quota is the realistic failure. The app is unaffected — this is a cache.
    logWarning("content_mirror_write_failed", err);
  }
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
