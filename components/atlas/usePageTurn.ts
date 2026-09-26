"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SHEET_SCREENS, type Screen } from "@/components/atlas/screen";

type Turning = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
};

/** How deep into the atlas a screen sits: going deeper settles the new screen up. */
const depth = (s: Screen) =>
  SHEET_SCREENS.has(s)
    ? 3
    : s === "map" || s === "profile" || s === "continent"
      ? 2
      : s === "dashboard"
        ? 1
        : 0;

/**
 * Wrap the one screen setter so every change of screen crossfades.
 *
 * The fade is the View Transitions API: the browser snapshots the outgoing
 * page, we commit the new screen, it snapshots that, and `globals.css`
 * animates the two snapshots (`::view-transition-*`) on the compositor. So a
 * fade costs nothing on the live DOM, needs no second copy of the render
 * switch mounted for an exit, and every one of the ~60 call sites that set a
 * screen gets it for free — they keep calling a plain `setScreen`.
 *
 * No fade: where the browser has no view transitions, under reduced motion,
 * out of onboarding's building/diagnostic (those are overlays on a map that
 * stays put), and from `welcome` to anything but `building` — that is a saved
 * run hydrating, not the learner changing screen.
 */
export function usePageTurn(
  screen: Screen,
  set: Dispatch<SetStateAction<Screen>>,
): Dispatch<SetStateAction<Screen>> {
  const current = useRef(screen);
  const committed = useRef<(() => void) | null>(null);

  // The new page is snapshotted once this resolves — after React has
  // committed it, never on a half-rendered frame.
  useLayoutEffect(() => {
    current.current = screen;
    committed.current?.();
    committed.current = null;
  }, [screen]);

  return useCallback(
    (action: SetStateAction<Screen>) => {
      const from = current.current;
      const to = typeof action === "function" ? action(from) : action;
      const doc = document as Turning;
      if (
        to === from ||
        !doc.startViewTransition ||
        committed.current ||
        from === "building" ||
        from === "diagnostic" ||
        (from === "welcome" && to !== "building") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return set(to);
      const html = document.documentElement;
      html.dataset.turn =
        depth(to) > depth(from) || (depth(to) === depth(from) && to !== "map")
          ? "fwd"
          : "back";
      const clear = () => delete html.dataset.turn;
      void doc
        .startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              committed.current = resolve;
              set(to);
              // A screen that renders nothing new never commits; don't hold
              // the page frozen waiting for it.
              setTimeout(resolve, 400);
            }),
        )
        .finished.then(clear, clear);
    },
    [set],
  );
}
