"use client";

// The generated content for the three phases the domain axis adds.
//
// Lifted out of `useRunState` only to keep that file at its size, and grouped
// because they arrive together: one map either has `interpretive` nodes or it
// does not. Everything about them is ordinary — one committed payload per node,
// hydrated from `node_content` with the rest, cleared with the rest.

import { useRef, useState } from "react";
import type {
  ProduceContent,
  ProvenanceContent,
  SteelmanContent,
} from "@/lib/curriculum";

export function useDomainPhaseCaches() {
  const [provenanceCache, setProvenanceCache] = useState<
    Record<string, ProvenanceContent>
  >({});
  const [steelmanCache, setSteelmanCache] = useState<Record<string, SteelmanContent>>({});
  const [produceCache, setProduceCache] = useState<Record<string, ProduceContent>>({});

  // A ref beside every state, as everywhere else in the run: the phase handlers
  // read at call time from inside callbacks that must not re-create themselves.
  const provenanceCacheRef = useRef(provenanceCache);
  provenanceCacheRef.current = provenanceCache;
  const steelmanCacheRef = useRef(steelmanCache);
  steelmanCacheRef.current = steelmanCache;
  const produceCacheRef = useRef(produceCache);
  produceCacheRef.current = produceCache;

  return {
    provenanceCache,
    setProvenanceCache,
    provenanceCacheRef,
    steelmanCache,
    setSteelmanCache,
    steelmanCacheRef,
    produceCache,
    setProduceCache,
    produceCacheRef,
  };
}
