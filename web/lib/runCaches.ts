// Per-node generated content, as the screens hold it — split from
// `persistence.ts`, which is the wire contract for learner data. Content is
// never uploaded; this is only the shape it is folded into on the way in.

import type {
  ConsumeChunk,
  ConsumeModelBeat,
  ExplainContent,
  PerformContent,
  RetainContent,
} from "@/lib/curriculum";

/**
 * Per-node generated content, as the screens hold it.
 *
 * Still the shape the app has always rendered from — but it is now assembled
 * from `node_content` rows on the way in and never written back. The server
 * records content the moment it generates it, which is what retired the
 * `caches` column and the four-second upload behind it.
 */
export interface RunCaches {
  consume: Record<string, ConsumeChunk[]>;
  /** Lens views already opened, keyed `model:<nodeId>:<chunkId>:<lens>`. */
  models: Record<string, ConsumeModelBeat[]>;
  explain: Record<string, ExplainContent>;
  perform: Record<string, PerformContent>;
  retain: RetainContent | null;
}

export const emptyCaches = (): RunCaches => ({
  consume: {},
  models: {},
  explain: {},
  perform: {},
  retain: null,
});
