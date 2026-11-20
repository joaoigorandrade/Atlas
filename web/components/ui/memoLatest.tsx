"use client";

import { memo, useRef, type ComponentType } from "react";

/**
 * `memo` for a component whose parent re-creates its handlers every render.
 *
 * AtlasApp re-renders on every pan frame (the view lives in it), and it hands
 * the rails fresh closures each time, so a plain `memo` never skipped anything.
 * Here a change of function alone is not a reason to render, and the component
 * receives a stable forwarder per handler that always calls the latest one —
 * the same bargain `MapCanvas` makes through its `on` ref, so skipping a render
 * can never leave a stale closure behind a click.
 */
export function memoLatest<P extends object>(Component: ComponentType<P>) {
  const Inner = memo(Component, (a, b) =>
    (Object.keys(b) as (keyof P)[]).every(
      (k) => typeof b[k] === "function" || Object.is(a[k], b[k]),
    ),
  );
  function Latest(props: P) {
    const latest = useRef(props);
    latest.current = props;
    const forwarders = useRef<Record<string, (...args: unknown[]) => unknown>>({});
    const stable = { ...props } as Record<string, unknown>;
    for (const [k, v] of Object.entries(props))
      if (typeof v === "function")
        stable[k] = forwarders.current[k] ??= (...args: unknown[]) =>
          (latest.current as Record<string, (...a: unknown[]) => unknown>)[k]?.(...args);
    return <Inner {...(stable as P)} />;
  }
  Latest.displayName = `memoLatest(${Component.displayName ?? Component.name})`;
  return Latest;
}
