"use client";

// The open topic's axes (target language, locale, lenses, shape, target), as
// the server stamped them — held beside `generationTopic` rather than threaded
// through the run state, because only a few surfaces read them and none of
// them writes one into a generation body (`withTopicAxes` owns that).

import { useSyncExternalStore } from "react";
import type { TopicAxes } from "@/lib/curriculum";

let current: TopicAxes | null = null;
const listeners = new Set<() => void>();

export function setTopicAxes(next: TopicAxes | null | undefined): void {
  current = next ?? null;
  for (const listen of listeners) listen();
}

export function topicAxes(): TopicAxes | null {
  return current;
}

export function useTopicAxes(): TopicAxes | null {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => current,
    () => null,
  );
}
