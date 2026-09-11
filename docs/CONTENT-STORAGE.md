# Content storage

How generated content is stored in the cloud and on each device. One contract
for the cloud, one mirror per platform. This file is the source of truth for
both clients — `AGENTS.md` and `ios/AGENTS.md` defer to it.

Learner _data_ (the graph, mastery, cards, progress) is not covered here; it
moves over `/api/v1` as deltas and has always had one owner. This is only
about the payloads a model wrote.

## The three stores

| Store             | Holds                             | Scope                  | Written by                      |
| ----------------- | --------------------------------- | ---------------------- | ------------------------------- |
| `content_cache`   | the payload bytes, once           | every learner, forever | `/api/generate`                 |
| `node_content`    | what a topic owns — and its bytes | one topic              | `/api/generate`, `/api/content` |
| the device mirror | a copy of the topic's items       | one device             | the client                      |

`content_cache` is keyed by a hash of the exact prompt inputs — that is what
makes the second learner on a topic free. `node_content` is one row per
`(topic, node, kind, variant)`, holding a `cache_key` pointer into it **and a
copy of the payload**. Neither client writes either one. **Content is never
uploaded.** The routes record a payload against the topic the moment it exists,
from either client, and the clients only ever read.

### Why the copy, when the pointer is the whole point

The pointer is still the fast path: the bytes live once for everyone, and a
topic's whole content is one batched RPC. But a pointer is only a pointer, and
two things delete what it points at — both of them deliberate:

- the TTL prune, which reclaims rows nothing has read in a season, and
- a `CONTENT_CACHE_VERSION` bump, which abandons every row in the table by
  design, because a hit is served without re-validation.

Until the copy existed, either one emptied every topic pointing at those rows.
A prompt tweak took every learner's reading with it, and the learner the TTL
was written for — the one coming back after a season — was exactly the one
whose topic it hollowed out. So:

1. **`putContent` writes the pointer and the payload.** A caller holding only
   the pointer never blanks a copy the row already has.
2. **The read prefers the pointer and falls back to the copy**
   (`/api/v1/topics/:id/content`). One place, the same unwrap either way.
3. **The prune skips addressed rows** (`prune_content_cache`): a row a
   `node_content` row points at is not storage to reclaim, however cold.

The invariant those three buy: **a topic keeps its content until the learner
deletes the topic.** Nothing else may take it.

### And a hit is content too

`/api/generate` has always recorded a cache hit against the topic. `/api/content`
— the batch warm, which is where most hits happen, one request per map open —
records them now as well. Content that is only in a browser's memory is content
the next load regenerates, and it regenerates _silently_: both requests succeed,
and the bill is the only place it shows. The client stamps every batch item with
the open topic (`addressed`, `lib/generationTopic.ts`) so the route has somewhere
to file what it found.

## Rule 1 — one shape on the wire: the render shape

A generator returns an envelope: `{chunks: […]}`, `{steps: […]}`,
`{beats: […]}`, `{content: {…}}`. That envelope is what `content_cache` stores,
because it is what `job.run()` returned.

**It never leaves the server.** `GET /api/v1/topics/:id/content` unwraps every
item to the value the screen renders — the array, or the object — so a stored
item arrives in exactly the shape a client assembles from live stream frames.
One unwrap, on the server, in `lib/server/store/content.ts`.

The rule that makes it safe: _the read path and the live path deliver the same
shape_, so a screen has one decoder, not two. A client that has to know about
`chunks` vs `steps` vs `content` is a client that will get it wrong — the web
learned this as `chunks.map is not a function`, and iOS as a `try?` that
silently dropped every row and regenerated.

Legacy rows backfilled by the normalization already hold the inner value; the
unwrap tolerates both and is the only place that ever has to.

## Rule 2 — one address: `nodeId|kind|variant`

That string is the identity of a piece of content, everywhere: the
`node_content` row, the client's in-memory cache, the mirror's row, the warm
queue's dedupe key. Both clients build it with one function and nothing else
addresses content.

| kind                                     | nodeId            | variant                           |
| ---------------------------------------- | ----------------- | --------------------------------- |
| `consume` `socratic` `feynman` `connect` | the node          | `""`                              |
| `crucible`                               | the node          | `""`, then `r1`, `r2`, … per redo |
| `model`                                  | the node          | `<chunkId>:<lens>`                |
| `retain`                                 | `""` (topic-wide) | `""`                              |

**What is deliberately _not_ in the address**: the topic (the cache belongs to
the open run and is cleared when it changes), the language (a run has exactly
one — `topics.language`), the interests, and the Connect/Crucible pool. Those
shape the _prompt_, and therefore the `content_cache` key, which is the
server's business. They are not part of what a client calls this content.

That last one is the change with teeth. iOS put the pool in its key, so
mastering any concept mid-run re-addressed Connect and Crucible and regenerated
content the browser would have re-served. A pool is a live derivation; an
address must not be.

Crucible reruns move the other way: they are genuinely different content the
learner should be able to reach again, so they get a real `variant` and stop
overwriting the first pass's row.

## Rule 3 — the device mirror: same policy, native mechanism

Each platform keeps its own mirror. There is no shared storage code, no
generated bindings, no sync protocol — two small files that obey the same five
rules.

|           | web                                                | iOS                           |
| --------- | -------------------------------------------------- | ----------------------------- |
| mechanism | `CacheStorage` (`caches.open("atlas-content-v1")`) | SwiftData (`LocalContent`)    |
| module    | `lib/contentMirror.ts`                             | `Data/Local/LocalStore.swift` |

Both expose the same four operations and nothing more:

```
read(topicId)          -> items          // what we have, now, offline
write(topicId, items)  -> void           // after a hydrate, and after a generation lands
drop(topicId)          -> void           // the topic was deleted
clear()                -> void           // sign-out
```

The five rules:

1. **It is a cache, never a source of truth.** Paint from it, then revalidate
   behind an interactive screen. A mirror that fails costs a round trip, never
   a screen — every operation is a no-op on error. It **merges**, never
   replaces: one landed generation writes one item, and a hydrate that comes
   back short must not take the copy on this device with it.
2. **It stores what the server sent**, item for item, unmodified. Never a
   rebuild from parts; never a re-encode of something decoded. That is what
   keeps the fields only the _other_ client renders from being stripped.
3. **It is written on both paths** — when a hydrate lands, and when a
   generation lands. Writing only on hydrate is why content read on the phone
   yesterday was not there this morning.
4. **A shape change is a rename, not a migration.** Bump the store name
   (`atlas-content-v2`) and drop the old one. Everything in it is re-fetchable,
   so a versioning ladder for a cache is pure cost.
5. **Sign-out clears it.** The next person holding the device must not open
   someone else's map.

Why `CacheStorage` on the web: it is the platform's own store for HTTP answers,
it takes megabytes where `localStorage` takes a few, and a topic's content is
literally one `Response` under one URL — `put` and `match`, no schema, no
object stores, no library. Why SwiftData on iOS: it is already there and
already correct.

## Rule 4 — an in-memory key is derived from the address and nothing else

Each client holds the open run's content keyed by the address, and may spell
that key however suits it — neither client ever reads the other's string, only
the same rows.

- **iOS**: one map, `nodeId|kind|variant` verbatim, with typed readers over it
  (`chunks(node)`, `steps(node)`, `lens(node, chunk, key)`).
- **web**: one typed bucket per kind, keyed within it. A bucket _is_ the kind,
  so `consume[nodeId]` is `nodeId|consume|`; `models` carries the variant
  because it is the only kind with two payloads on one node.

The rule is what may go into that key: **(node, kind, variant), and nothing
else.** Not the pool, not the language, not the run — a key derived from
anything that moves when the learner's progress does is a key that
re-addresses, and re-addressing means regenerating content the topic already
owns. That was the actual divergence between the two clients, and it is the
whole of what rule 4 is for. Collapsing the web's seven typed buckets into one
untyped map would carry the same identity at the cost of 117 call sites in the
phase engine, so it is deliberately not done.

Cleared when the run changes. Nothing survives a sign-out.

The warm queue dedupes on the same address — a warm and the click that beats it
share one request, which is only true if they agree.

## What this deletes

- `inner()` and the seven `*Cache` states on the web
- `cacheInputs`, `crucibleInputs`, and the pool-in-key logic on iOS
- `WarmCache.raw`, `revision`, and `AtlasStore.savedWarm` — the diff machinery
  for an upload that was retired with the `caches` column. What `raw` was for
  is now covered by rule 3: the item goes to the mirror as it arrived.

## The topic itself

One rule, and it belongs here because breaking it loses content by the topicful
rather than by the row: **onboarding's undo deletes only what onboarding
created.**

Creating a topic is an upsert on `(user_id, subject)` — re-running onboarding on
a subject the learner already has is a rebuild of that topic, not a second one.
But the build opens the topic _before_ the map is generated (the server-side
frontier warm needs somewhere to file what it writes) and deletes it again on
any exit that produces no map: a build error, or a subject too broad to map.
That undo could not tell a row it had just made from the learner's existing map,
and the delete cascades — nodes, edges, cards, `node_content`, the device mirror.

`POST /api/v1/topics` answers with `created`, and only a `created` topic may be
undone. A server that does not say reads as `false` on both clients: an empty
topic on the dashboard is a blemish, a deleted one is the learner's work.

## Migration order

Each step ships on its own and leaves the app working. No flag day. All done.

1. **Server unwraps** (`content/route.ts` + a test per kind). Zero client
   changes: the web's `inner()` is a no-op on an already-unwrapped payload, and
   iOS starts adopting stored content for the first time — no release needed.
2. **Web drops `inner()`.**
3. **Both re-key to the address.** iOS drops the pool and the run from its key
   and adopts `variant`; the web's buckets already are the address.
4. **Web gains the mirror** (`lib/contentMirror.ts`, ~40 lines).
5. **iOS writes the mirror at generation time** (`warm.onLanded`) and deletes
   `raw`/`revision`/`savedWarm`.
6. **The web writes it at generation time too** (`mirrorItem`, from the loaders
   and the batch-hit path in `useGeneration`) — rule 3 point 3 was half-shipped
   on this side, so everything read in a session was absent from disk until the
   next load.

Prerequisite, not part of this design but the same principle — one place
derives a generation's inputs: `lib/server/afterBuild.ts` builds its post-build
warm without `priorLabels`/`laterLabels`, so it hashes to a `content_cache` key
no client ever asks for. Every frontier warm it pays for is unreachable by the
click that follows.

## Not in this design

- **No shared code between TypeScript and Swift.** Two implementations of four
  functions is cheaper to keep alive than a codegen step.
- **No sync protocol, no conflict resolution.** Content at an address is
  immutable — the same address is the same content — so there is nothing to
  merge.
- **No conditional fetch.** `hydrateContent` asks for the whole topic each
  load. When a topic's content is big enough for that to hurt, the route
  already takes `?nodes=&kinds=`; until then a filter is a cache-invalidation
  bug waiting to happen.
