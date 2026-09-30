// Per-node generated content, as the screens hold it — split from
// `persistence.ts`, which is the wire contract for learner data. Content is
// never uploaded; this is only the shape it is folded into on the way in.

import type {
  ConsumeChunk,
  ConsumeModelBeat,
  SocraticStep,
  FeynmanBeat,
  ElaborationContent,
  CrucibleContent,
  DiscriminateContent,
  PredictContent,
  TraceContent,
  DrillContent,
  RecallContent,
  PerformContent,
  ProvenanceContent,
  SteelmanContent,
  ProduceContent,
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
  socratic: Record<string, SocraticStep[]>;
  feynman: Record<string, FeynmanBeat[]>;
  connect: Record<string, ElaborationContent>;
  crucible: Record<string, CrucibleContent>;
  // The six phases of the catalogue's growth to twelve. Each keyed by node
  // id, exactly like the eight before them.
  discriminate: Record<string, DiscriminateContent>;
  predict: Record<string, PredictContent>;
  trace: Record<string, TraceContent>;
  drill: Record<string, DrillContent>;
  recall: Record<string, RecallContent>;
  perform: Record<string, PerformContent>;
  provenance: Record<string, ProvenanceContent>;
  steelman: Record<string, SteelmanContent>;
  produce: Record<string, ProduceContent>;
  retain: RetainContent | null;
}

export const emptyCaches = (): RunCaches => ({
  consume: {},
  models: {},
  socratic: {},
  feynman: {},
  connect: {},
  crucible: {},
  discriminate: {},
  predict: {},
  trace: {},
  drill: {},
  recall: {},
  perform: {},
  provenance: {},
  steelman: {},
  produce: {},
  retain: null,
});
