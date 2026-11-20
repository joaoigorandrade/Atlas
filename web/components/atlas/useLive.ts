"use client";

// A ref that always holds this render's value.
//
// The pattern it replaces was written out longhand thirty-odd times across the
// hooks — `const xRef = useRef(x); xRef.current = x;` — and every occurrence
// was the same two lines for the same reason: a handler inside a `useCallback`
// that must not re-create itself on every keystroke still has to read the
// current value at call time. Two lines per value is how that block grew to
// fifty, which is the cost this removes.
//
// It is not a `useEffect`: the assignment happens during render, on purpose, so
// a callback fired in the same commit reads the value that render produced
// rather than the one before it.

// Where it does NOT apply: `useSpiral` keeps the longhand for its
// `enter*Ref` / `*SubmitRef` pairs, which are declared *after* the callback
// they hold in order to break a cycle. `exhaustive-deps` exempts a value it
// can see come from `useRef`; it cannot see through this call, so it demands
// the ref in the dep array — and naming one declared further down the file is
// a use-before-declaration. Value mirrors here, cycle-breakers longhand.

import { useRef } from "react";

export function useLive<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
