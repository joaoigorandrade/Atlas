// ---- Confidence readings: one scale, one running mean ----------------------
// Every phase that asks "how sure are you?" before the work answers on this
// scale and folds its reading in here, so the curve in `calibration.ts` is an
// average over every attempt rather than whichever came last.

import type { CalibSample } from "./calibration";

/** The felt-% each confidence tap stands for, least → most sure. One scale
 *  for every phase that asks, so readings from different phases average. */
export const CONFIDENCE_FELT = [35, 65, 90] as const;

/**
 * Fold one reading into a node's sample: a running mean over every reading,
 * not the old `(previous + new) / 2`, which let the latest attempt outweigh
 * all the others together. Integers, because the phone decodes them as `Int`.
 */
export function mergeCalib(
  samples: CalibSample[],
  id: string,
  felt: number,
  real: number,
): CalibSample[] {
  const at = samples.findIndex((s) => s.id === id);
  if (at < 0) return [...samples, { id, felt, real, n: 1 }];
  return samples.map((s, i) => {
    if (i !== at) return s;
    const n = Math.max(1, s.n ?? 1);
    const mean = (old: number, add: number) => Math.round((old * n + add) / (n + 1));
    return { id, felt: mean(s.felt, felt), real: mean(s.real, real), n: n + 1 };
  });
}

/**
 * A run's reading, for the phases that ask once before the first item: the tap,
 * against the share of the items answered that came out right. Null until the
 * run has both, so a run left before its first answer files nothing.
 */
export function runReading(
  sure: number | undefined,
  right: number,
  answered: number,
): { felt: number; real: number } | null {
  if (sure === undefined || answered === 0) return null;
  return { felt: CONFIDENCE_FELT[sure], real: Math.round((100 * right) / answered) };
}
