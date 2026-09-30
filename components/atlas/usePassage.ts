"use client";

// "Ask about this": the learner's own question about a passage of the reading
// they highlighted, answered against that section and streamed back a
// paragraph at a time. Lifted out of `useSpiral` on the `usePerform`
// precedent — it opens and closes inside the reading and hands off to nothing.

import { fetchPassageStream } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { PassageAsk } from "@/components/session/ConsumeView";
import type { RunState } from "./useRunState";
import type { SessionState } from "./useSessionState";

export function usePassage(deps: {
  run: RunState;
  sessions: SessionState;
  languageRef: React.RefObject<Language>;
}) {
  const { graphRef, formRef, consumeCacheRef } = deps.run;
  const { setConsume, consumeRef, liveConsumeRef } = deps.sessions;
  const { languageRef } = deps;

  /** Open the ask panel on a section. `selection` is the highlighted text, or
   *  "" when asked from the keyboard path (the question is the whole section). */
  const consumeOpenPassage = (chunkId: string, selection: string) => {
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            passage: {
              chunkId,
              selection,
              question: "",
              parts: [],
              status: "composing",
            },
          }
        : prev,
    );
  };

  const consumeClosePassage = () => {
    setConsume((prev) => (prev ? { ...prev, passage: null } : prev));
  };

  /**
   * Ask it — the learner's own question about the passage they highlighted,
   * answered against the section they're reading and streamed back a paragraph
   * at a time.
   *
   * The section prose stands in for the selection on the keyboard path: the
   * generator needs something to be *about*, and "this whole section" is the
   * truthful answer there rather than an arbitrary sentence from it.
   */
  const consumeAskPassage = (question: string) => {
    const live = consumeRef.current;
    const ask = live?.passage;
    if (!live || !ask || ask.status !== "composing") return;
    const node = graphRef.current.nodes.find((n) => n.id === live.nodeId);
    const chunks =
      consumeCacheRef.current[live.nodeId] ??
      (liveConsumeRef.current?.nodeId === live.nodeId
        ? liveConsumeRef.current.chunks
        : []);
    const chunk = chunks.find((c) => c.id === ask.chunkId);
    if (!node || !chunk) return;
    const section = chunk.body.join("\n\n");

    /** Fold an update into the ask, but only while it's still the open one —
     *  a learner who closed the panel or moved node mid-stream must not have
     *  a late frame reopen it. */
    const patch = (fn: (a: PassageAsk) => PassageAsk) =>
      setConsume((prev) =>
        prev &&
        prev.nodeId === live.nodeId &&
        prev.passage?.chunkId === ask.chunkId &&
        prev.passage.status !== "composing"
          ? { ...prev, passage: fn(prev.passage) }
          : prev,
      );

    setConsume((prev) =>
      prev && prev.passage?.chunkId === ask.chunkId
        ? { ...prev, passage: { ...prev.passage, question, status: "asking" } }
        : prev,
    );

    fetchPassageStream(
      {
        topic: formRef.current.topic,
        nodeLabel: node.label,
        kicker: chunk.kicker,
        section,
        selection: ask.selection || section,
        question,
        language: languageRef.current,
      },
      (part, index) =>
        patch((a) => {
          const parts = [...a.parts];
          parts[index] = part;
          return { ...a, parts: parts.filter((p) => p !== undefined) };
        }),
    )
      .then((parts) => patch((a) => ({ ...a, parts, status: "done" })))
      .catch(() => patch((a) => ({ ...a, status: "error" })));
  };

  return { consumeOpenPassage, consumeClosePassage, consumeAskPassage };
}
