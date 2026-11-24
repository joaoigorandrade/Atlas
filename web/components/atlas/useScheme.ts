import { useSyncExternalStore } from "react";
import type { Scheme } from "@/lib/theme";

// The device's colour scheme, for the few painters that can't read a `var()`
// (a baked bitmap, the atlas worker). Everything else flips through CSS.
const query = "(prefers-color-scheme: dark)";
const subscribe = (cb: () => void) => {
  const m = matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export const useScheme = (): Scheme =>
  useSyncExternalStore(
    subscribe,
    () => (matchMedia(query).matches ? "dark" : "light"),
    () => "light",
  );
