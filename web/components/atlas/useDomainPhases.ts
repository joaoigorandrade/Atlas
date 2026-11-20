"use client";

// The three phases the domain axis adds, mounted as one.
//
// Each keeps its own hook — they are purpose-built and share nothing but
// plumbing — and this only spares `useSpiral` three near-identical mount
// blocks. Provenance takes no judge deps at all: every claim ships its own
// ruling, so the whole pass grades in the browser.

import { useProduce } from "@/components/atlas/useProduce";
import { useProvenance } from "@/components/atlas/useProvenance";
import { useSteelman } from "@/components/atlas/useSteelman";

type Deps = Parameters<typeof useSteelman>[0];

export function useDomainPhases(deps: Deps) {
  return {
    ...useProvenance(deps),
    ...useSteelman(deps),
    ...useProduce(deps),
  };
}
