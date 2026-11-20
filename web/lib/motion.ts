"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "@/lib/theme";

/**
 * Whether the device asks for reduced motion.
 *
 * `app/globals.css` already collapses every CSS animation and transition under
 * `prefers-reduced-motion`, but that blanket cannot reach two things: an
 * `animation-delay` (an element with `both` fill sits invisible for the whole
 * delay, however short the duration) and anything driven from JS — a mount
 * delay, a `requestAnimationFrame` count-up. Those read this hook instead.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export type PresenceState = "in" | "out";

/**
 * Keep a child mounted long enough to animate itself out.
 *
 * Every overlay, drawer and toast in the app used to vanish on the frame its
 * state went false. Wrap the flag in this and render while `mounted`, feeding
 * `state` to an enter/exit keyframe pair.
 *
 * The exit is skipped entirely under reduced motion — there is nothing to wait
 * for, and holding a dismissed panel on screen for 220ms would be a bug, not a
 * courtesy.
 */
export function usePresence(
  open: boolean,
  ms: number = motion.duration.base,
): { mounted: boolean; state: PresenceState } {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (reduced) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms, reduced]);

  return { mounted, state: open ? "in" : "out" };
}

/**
 * True for one short window each time `value` changes to something that passes
 * `when` — the seam every reward moment hangs off.
 *
 * The first value never fires: a map arriving from persistence with half its
 * concepts already green is not twenty concepts being mastered at once. Pass
 * `enabled: false` for the other bulk recolours (the momentum replay, the
 * diagnostic pruning whole branches) so they stay silent too.
 */
export function useCelebrate<T>(
  value: T,
  when: (next: T, prev: T) => boolean,
  { ms = 1100, enabled = true }: { ms?: number; enabled?: boolean } = {},
): boolean {
  const prev = useRef<T | null>(null);
  const [firing, setFiring] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null || !enabled || reduced) return;
    if (!when(value, before)) return;
    setFiring(true);
    const t = setTimeout(() => setFiring(false), ms);
    return () => clearTimeout(t);
    // `when` is a predicate, re-created per render at most call sites; keying
    // the effect on `value` alone is deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, reduced, ms]);

  return firing;
}

/**
 * A number that travels to its new value instead of jumping there.
 *
 * Snaps under reduced motion, and snaps on the first value — a mastery
 * percentage restored from a saved run should already be where it belongs, not
 * count up from zero every time the map opens.
 */
export function useCountUp(
  target: number,
  ms: number = motion.duration.deliberate,
): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      from.current = target;
      setShown(target);
      return;
    }
    if (reduced) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Matches `motion.ease.enter` closely enough for a number.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      setShown(next);
      from.current = next;
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);

  return shown;
}

/**
 * Track which keys of a record just changed to a value worth marking, and hold
 * them until a consumer is looking.
 *
 * Two problems this solves that a plain diff doesn't. The surface that draws
 * the mark can be unmounted when the change happens — a concept is mastered
 * inside a session, and the map that would celebrate it is not on screen — so
 * changes accumulate while `visible` is false and release the moment it turns
 * true. And a first observation is never a change: a run restored from
 * persistence arrives with its history already in place.
 */
export function useEarned<T extends string>(
  values: Record<string, T>,
  worthMarking: (next: T, prev: T) => boolean,
  {
    visible,
    enabled = true,
    ms = 900,
  }: { visible: boolean; enabled?: boolean; ms?: number },
): Record<string, T> {
  const seen = useRef<Record<string, T> | null>(null);
  const pending = useRef<Record<string, T>>({});
  const [shown, setShown] = useState<Record<string, T>>({});
  const reduced = useReducedMotion();

  useEffect(() => {
    const before = seen.current;
    seen.current = values;
    if (!before || !enabled || reduced) return;
    for (const [key, next] of Object.entries(values) as [string, T][]) {
      const prev = before[key];
      if (prev !== undefined && prev !== next && worthMarking(next, prev)) {
        pending.current[key] = next;
      }
    }
    // `worthMarking` is a predicate re-created per render at most call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, enabled, reduced]);

  useEffect(() => {
    if (!visible || reduced) return;
    const ready = pending.current;
    if (!Object.keys(ready).length) return;
    pending.current = {};
    setShown(ready);
  }, [visible, values, reduced]);

  // The clear is keyed on what's shown, not on `values`. Keyed on `values` a
  // second change mid-celebration would cancel this timer and never replace it,
  // leaving the mark on screen for good.
  useEffect(() => {
    if (!Object.keys(shown).length) return;
    const t = setTimeout(() => setShown({}), ms);
    return () => clearTimeout(t);
  }, [shown, ms]);

  return shown;
}
