"use client";

// The generated content for the three phases the domain axis adds, and for
// Explain, which came after them.
//
// Lifted out of `useRunState` only to keep that file at its size. Everything
// about them is ordinary — one committed payload per node, hydrated from
// `node_content` with the rest, cleared with the rest.

import { useRef, useState } from "react";
import type {
  ExplainContent,
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
  const [explainCache, setExplainCache] = useState<Record<string, ExplainContent>>({});

  // A ref beside every state, as everywhere else in the run: the phase handlers
  // read at call time from inside callbacks that must not re-create themselves.
  const provenanceCacheRef = useRef(provenanceCache);
  provenanceCacheRef.current = provenanceCache;
  const steelmanCacheRef = useRef(steelmanCache);
  steelmanCacheRef.current = steelmanCache;
  const produceCacheRef = useRef(produceCache);
  produceCacheRef.current = produceCache;
  const explainCacheRef = useRef(explainCache);
  explainCacheRef.current = explainCache;

  /** Each cache with the `RunCaches` key it hydrates from — a slice of
   *  `useRunState`'s one table, so a phase here is added in one file. */
  const contentTables = [
    [setProvenanceCache, "provenance"],
    [setSteelmanCache, "steelman"],
    [setProduceCache, "produce"],
    [setExplainCache, "explain"],
  ] as const;

  return {
    contentTables,
    provenanceCache,
    setProvenanceCache,
    provenanceCacheRef,
    steelmanCache,
    setSteelmanCache,
    steelmanCacheRef,
    produceCache,
    setProduceCache,
    produceCacheRef,
    explainCache,
    setExplainCache,
    explainCacheRef,
  };
}
