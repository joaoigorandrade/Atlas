// Which topic a generation belongs to.
//
// Ambient rather than threaded through each caller's params, because it is the
// same for every request in a run — a property of which map is open, not of
// what is being asked for. Threading it meant touching all seven param builders
// in `useGeneration`, and every one of them was the same line.
//
// It is never part of a cache key: that is shared across every learner on the
// topic and keyed by the prompt inputs alone. This is the address the server
// files the result under, which is what makes the content the learner's the
// moment it exists, with no upload from any client.

let openTopicId: string | null = null;
/** Bumped whenever what is in flight stops being wanted — another map, or the
 *  caches cleared for a new language. A response that lands across a bump is
 *  dropped (`WarmDeclined`), or it writes into the run that replaced its own. */
let epoch = 0;

export function setGenerationTopic(id: string | null): void {
  // null → id is a new build getting its address mid-flight, not a switch.
  if (openTopicId && id !== openTopicId) epoch++;
  openTopicId = id;
}

/** Bump, and hand back "is nothing newer since?" for whoever bumped. */
export function supersedeGenerations(): () => boolean {
  const at = ++epoch;
  return () => epoch === at;
}
export const generationEpoch = (): number => epoch;

/** The open topic, for the one other thing that is per-run and reaches for it
 *  ambiently rather than through props: the device mirror, which files a landed
 *  generation under the run it belongs to. */
export function generationTopic(): string | null {
  return openTopicId;
}

/** A generation body, stamped with where it belongs. */
export const addressed = (
  body: Record<string, unknown>,
  prefetch = false,
): Record<string, unknown> => ({
  ...body,
  ...(openTopicId ? { topicId: openTopicId } : null),
  ...(prefetch ? { prefetch: true } : null),
});
