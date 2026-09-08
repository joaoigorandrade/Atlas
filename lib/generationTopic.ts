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

export function setGenerationTopic(id: string | null): void {
  openTopicId = id;
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
