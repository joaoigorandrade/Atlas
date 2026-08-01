// Client helper for the content-generation endpoint. Every screen that needs
// AI content goes through here; errors surface as thrown Errors the caller
// toasts.

import type {
  ConceptGraph,
  ConsumeChunk,
  CrucibleContent,
  DiagnosticQuestion,
  ElaborationContent,
  FeynmanBeat,
  GoalKind,
  RetainContent,
  SocraticStep,
} from "@/lib/curriculum";

/** Options every content fetcher accepts. `prefetch` marks a background warm:
 *  the server may decline it (204) to keep quota for what the learner asks for
 *  by hand, and the caller treats that as a silent no-op. */
export interface FetchOpts {
  prefetch?: boolean;
}

/** A background warm the server declined — swallowed by the warm queue. */
export class WarmDeclined extends Error {
  constructor() {
    super("prefetch declined");
  }
}

async function post<T>(
  body: Record<string, unknown>,
  opts?: FetchOpts,
): Promise<T> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts?.prefetch ? { ...body, prefetch: true } : body),
  });
  if (res.status === 204) throw new WarmDeclined();
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || !data)
    throw new Error(data?.error ?? `generation failed (${res.status})`);
  return data;
}

/**
 * The batch warm: ask which of these requests are already in the shared
 * content cache and take them without a model call. Answers positionally —
 * `hits[i]` is the payload for `items[i]`, absent on a miss. Best-effort: a
 * failure here just means nothing was pre-filled.
 */
export async function fetchCachedContent(
  items: Array<Record<string, unknown>>,
): Promise<Record<number, unknown>> {
  if (items.length === 0) return {};
  try {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { hits?: Record<number, unknown> };
    return data.hits ?? {};
  } catch {
    return {};
  }
}

export interface CurriculumPayload {
  graph: ConceptGraph;
  diagnostic: DiagnosticQuestion[];
}

/** Too-broad topics come back as scoped sub-map offers instead of a map (#30). */
export interface ScopeOffer {
  label: string;
  note: string;
}

export type CurriculumResult = CurriculumPayload | { scopes: ScopeOffer[] };

export function fetchCurriculum(params: {
  topic: string;
  goal: GoalKind;
  interests: string;
  outline?: string;
}): Promise<CurriculumResult> {
  return post<CurriculumResult>({ kind: "curriculum", ...params });
}

// Each fetcher pairs with a `<kind>Request` builder returning the exact body
// it posts. The builders are what `fetchCachedContent` batches, which is how a
// warm addresses the same cache row the real call would.

export const consumeRequest = (params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
}) => ({ kind: "consume", ...params });

export async function fetchConsume(
  params: Parameters<typeof consumeRequest>[0],
  opts?: FetchOpts,
): Promise<ConsumeChunk[]> {
  return (await post<{ chunks: ConsumeChunk[] }>(consumeRequest(params), opts))
    .chunks;
}

/**
 * The foreground Consume fetch: the server streams one JSON object per line
 * as each section is written, so `onChunk` fires section-by-section instead
 * of the caller waiting on the whole reading pass. Never used for a
 * background warm — nobody's watching a prefetch, so that stays on the
 * plain `fetchConsume`/`post` path above.
 */
export async function fetchConsumeStream(
  params: Parameters<typeof consumeRequest>[0],
  onChunk: (chunk: ConsumeChunk) => void,
): Promise<ConsumeChunk[]> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(consumeRequest(params)),
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `generation failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: ConsumeChunk[] = [];
  let buf = "";
  const takeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const chunk = JSON.parse(trimmed) as ConsumeChunk;
    chunks.push(chunk);
    onChunk(chunk);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      takeLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  takeLine(buf);
  if (chunks.length === 0) throw new Error("generation failed (empty response)");
  return chunks;
}

export const socraticRequest = (params: {
  topic: string;
  nodeLabel: string;
  interests: string;
}) => ({ kind: "socratic", ...params });

export async function fetchSocratic(
  params: Parameters<typeof socraticRequest>[0],
  opts?: FetchOpts,
): Promise<SocraticStep[]> {
  return (await post<{ steps: SocraticStep[] }>(socraticRequest(params), opts))
    .steps;
}

export const feynmanRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
}) => ({ kind: "feynman", ...params });

export async function fetchFeynman(
  params: Parameters<typeof feynmanRequest>[0],
  opts?: FetchOpts,
): Promise<FeynmanBeat[]> {
  return (await post<{ beats: FeynmanBeat[] }>(feynmanRequest(params), opts))
    .beats;
}

export const connectRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  pool: Array<{ id: string; label: string }>;
  interests: string;
}) => ({ kind: "connect", ...params });

export async function fetchConnect(
  params: Parameters<typeof connectRequest>[0],
  opts?: FetchOpts,
): Promise<ElaborationContent> {
  return (
    await post<{ content: ElaborationContent }>(connectRequest(params), opts)
  ).content;
}

export const crucibleRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  masteredLabels: string[];
  interests: string;
}) => ({ kind: "crucible", ...params });

export async function fetchCrucible(
  params: Parameters<typeof crucibleRequest>[0],
  opts?: FetchOpts,
): Promise<CrucibleContent> {
  return (
    await post<{ content: CrucibleContent }>(crucibleRequest(params), opts)
  ).content;
}

export const retainRequest = (params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string }>;
  interests: string;
}) => ({ kind: "retain", ...params });

export async function fetchRetain(
  params: Parameters<typeof retainRequest>[0],
  opts?: FetchOpts,
): Promise<RetainContent> {
  return (await post<{ content: RetainContent }>(retainRequest(params), opts))
    .content;
}

// ---- the judging loop (#25-#27) — the learner's own words, classified ------

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
}

export async function fetchJudgeSocratic(params: {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
}): Promise<SocraticJudgement> {
  return (
    await post<{ judgement: SocraticJudgement }>({
      kind: "judge",
      mode: "socratic",
      ...params,
    })
  ).judgement;
}

export interface FeynmanJudgement {
  verdict: "good" | "skipped" | "confused";
  response: string;
}

export async function fetchJudgeFeynman(params: {
  topic: string;
  nodeLabel: string;
  subPoint: string;
  reference: string;
  answer: string;
}): Promise<FeynmanJudgement> {
  return (
    await post<{ judgement: FeynmanJudgement }>({
      kind: "judge",
      mode: "feynman",
      ...params,
    })
  ).judgement;
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

export async function fetchJudgeCrucible(params: {
  topic: string;
  nodeLabel: string;
  problem: string;
  hint: string;
  answer: string;
}): Promise<CrucibleJudgement> {
  return (
    await post<{ judgement: CrucibleJudgement }>({
      kind: "judge",
      mode: "crucible",
      ...params,
    })
  ).judgement;
}

/** Maps a free-text answer onto a closed option list (the open-ended half of
 *  placement, the Consume hook, and the Feynman fix pass). */
export interface ChoiceJudgement {
  index: number;
  response: string;
}

export async function fetchJudgeChoice(params: {
  topic: string;
  nodeLabel?: string;
  question: string;
  options: string[];
  answer: string;
}): Promise<ChoiceJudgement> {
  return (
    await post<{ judgement: ChoiceJudgement }>({
      kind: "judge",
      mode: "choice",
      ...params,
    })
  ).judgement;
}
