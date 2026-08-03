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
import type { Language } from "@/lib/i18n";

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

export interface CurriculumParams {
  topic: string;
  goal: GoalKind;
  interests: string;
  outline?: string;
  language?: Language;
}

export function fetchCurriculum(params: CurriculumParams): Promise<CurriculumResult> {
  return post<CurriculumResult>({ kind: "curriculum", ...params });
}

/**
 * The onboarding build, streamed. The map arrives as its own frame and the
 * three placement questions follow one at a time, so the assembly animation
 * can start on the graph instead of on the whole payload — this is the one
 * generation in the app that can never be warmed, since the node ids don't
 * exist until it returns.
 *
 * `onGraph` may never fire: a topic too broad for one coherent map answers
 * with scope offers instead, and `onScopes` fires alone.
 */
export async function fetchCurriculumStream(
  params: CurriculumParams,
  handlers: {
    onGraph: (graph: ConceptGraph) => void;
    onQuestion: (question: DiagnosticQuestion, index: number) => void;
    onScopes: (scopes: ScopeOffer[]) => void;
  },
): Promise<void> {
  await fetchStream({ kind: "curriculum", ...params }, (frame) => {
    if (frame.p === "graph") handlers.onGraph(frame.v as ConceptGraph);
    else if (frame.p === "scopes") handlers.onScopes(frame.v as ScopeOffer[]);
    else if (frame.p === "diagnostic" && "i" in frame)
      handlers.onQuestion(frame.v as DiagnosticQuestion, frame.i);
  });
}

// Each fetcher pairs with a `<kind>Request` builder returning the exact body
// it posts. The builders are what `fetchCachedContent` batches, which is how a
// warm addresses the same cache row the real call would.

export const consumeRequest = (params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
}) => ({ kind: "consume", ...params });

export async function fetchConsume(
  params: Parameters<typeof consumeRequest>[0],
  opts?: FetchOpts,
): Promise<ConsumeChunk[]> {
  return (await post<{ chunks: ConsumeChunk[] }>(consumeRequest(params), opts))
    .chunks;
}

/** One slot of a payload, as it comes off the NDJSON wire. Mirrors
 *  `lib/server/stream.ts`'s `StreamFrame` — declared here too so client code
 *  never imports from `lib/server`. */
export type StreamFrame =
  | { p: string; v: unknown }
  | { p: string; i: number; v: unknown };

/**
 * Post a streaming request and read its NDJSON frames as they land. Shared by
 * every progressively-delivered kind; `onFrame` fires the moment a frame
 * arrives, and the resolved array is every frame in arrival order.
 *
 * A slot can arrive more than once — a Consume section shows up as pure
 * reading material and again once its adaptive rewrites are ready — so callers
 * that build state from frames must replace by `(p, i)`, never append. That is
 * what `collectFrames` below does.
 */
export async function fetchStream(
  body: Record<string, unknown>,
  onFrame: (frame: StreamFrame) => void,
): Promise<StreamFrame[]> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `generation failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames: StreamFrame[] = [];
  let buf = "";
  const takeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const frame = JSON.parse(trimmed) as StreamFrame;
    frames.push(frame);
    onFrame(frame);
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
  if (frames.length === 0) throw new Error("generation failed (empty response)");
  return frames;
}

/** Fold the indexed frames of one list part into an array, replacing by index
 *  so a re-sent slot patches rather than duplicates. */
export function collectFrames<T>(frames: StreamFrame[], part: string): T[] {
  const out: T[] = [];
  for (const f of frames) {
    if (f.p !== part || !("i" in f)) continue;
    out[f.i] = f.v as T;
  }
  return out.filter((v) => v !== undefined);
}

/**
 * The foreground Consume fetch: the server streams one frame per section as it
 * is written, so `onChunk` fires section-by-section instead of the caller
 * waiting on the whole reading pass. Never used for a background warm —
 * nobody's watching a prefetch, so that stays on the plain
 * `fetchConsume`/`post` path above.
 */
export async function fetchConsumeStream(
  params: Parameters<typeof consumeRequest>[0],
  onChunk: (chunk: ConsumeChunk, index: number) => void,
): Promise<ConsumeChunk[]> {
  const frames = await fetchStream(consumeRequest(params), (frame) => {
    if (frame.p === "chunks" && "i" in frame)
      onChunk(frame.v as ConsumeChunk, frame.i);
  });
  return collectFrames<ConsumeChunk>(frames, "chunks");
}

export const socraticRequest = (params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
}) => ({ kind: "socratic", ...params });

export async function fetchSocratic(
  params: Parameters<typeof socraticRequest>[0],
  opts?: FetchOpts,
): Promise<SocraticStep[]> {
  return (await post<{ steps: SocraticStep[] }>(socraticRequest(params), opts))
    .steps;
}

/** Foreground Socratic: the tutor's first probe renders as soon as it's
 *  written, the rest follow. Background warms stay on `fetchSocratic`. */
export async function fetchSocraticStream(
  params: Parameters<typeof socraticRequest>[0],
  onStep: (step: SocraticStep, index: number) => void,
): Promise<SocraticStep[]> {
  const frames = await fetchStream(socraticRequest(params), (frame) => {
    if (frame.p === "steps" && "i" in frame)
      onStep(frame.v as SocraticStep, frame.i);
  });
  return collectFrames<SocraticStep>(frames, "steps");
}

export const feynmanRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
}) => ({ kind: "feynman", ...params });

export async function fetchFeynman(
  params: Parameters<typeof feynmanRequest>[0],
  opts?: FetchOpts,
): Promise<FeynmanBeat[]> {
  return (await post<{ beats: FeynmanBeat[] }>(feynmanRequest(params), opts))
    .beats;
}

/** Foreground Feynman: the first beat opens the teach-back, the rest follow.
 *  This is the largest payload of any phase, so it gains the most. */
export async function fetchFeynmanStream(
  params: Parameters<typeof feynmanRequest>[0],
  onBeat: (beat: FeynmanBeat, index: number) => void,
): Promise<FeynmanBeat[]> {
  const frames = await fetchStream(feynmanRequest(params), (frame) => {
    if (frame.p === "beats" && "i" in frame)
      onBeat(frame.v as FeynmanBeat, frame.i);
  });
  return collectFrames<FeynmanBeat>(frames, "beats");
}

export const connectRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  pool: Array<{ id: string; label: string }>;
  interests: string;
  language?: Language;
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
  language?: Language;
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
  language?: Language;
}) => ({ kind: "retain", ...params });

export async function fetchRetain(
  params: Parameters<typeof retainRequest>[0],
  opts?: FetchOpts,
): Promise<RetainContent> {
  return (await post<{ content: RetainContent }>(retainRequest(params), opts))
    .content;
}

// ---- the judging loop (#25-#27) — the learner's own words, classified ------

/**
 * A judge call, verdict-first.
 *
 * The server writes the verdict as its own tiny JSON object and the critique
 * as a second one, so `onVerdict` fires roughly a second in — that is the
 * moment the screen can move — and the promise resolves with the complete
 * judgement when the prose lands.
 *
 * `onVerdict` may fire once (the usual streamed case) or never (the single-shot
 * fallback, where the first frame already carries everything). Callers must
 * therefore treat it as an optimisation and still handle the whole judgement
 * on resolve — `applied` flags in AtlasApp are exactly that.
 */
async function judge<T>(
  body: Record<string, unknown>,
  onVerdict?: (partial: Partial<T>) => void,
): Promise<T> {
  let seen = 0;
  let last: T | null = null;
  const frames = await fetchStream(body, (frame) => {
    // Only the first frame is the verdict prefix. Which frame is *last* isn't
    // knowable until the stream ends, so the resolved value comes from the
    // collected frames below rather than from this callback.
    if (frame.p === "judgement" && seen++ === 0) onVerdict?.(frame.v as Partial<T>);
  });
  for (const frame of frames) if (frame.p === "judgement") last = frame.v as T;
  if (!last) throw new Error("the judge returned nothing");
  return last;
}

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
}

export function fetchJudgeSocratic(
  params: {
    topic: string;
    nodeLabel: string;
    question: string;
    reference: string;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<SocraticJudgement>) => void,
): Promise<SocraticJudgement> {
  return judge({ kind: "judge", mode: "socratic", ...params }, onVerdict);
}

export interface FeynmanJudgement {
  verdict: "good" | "skipped" | "confused";
  response: string;
}

export function fetchJudgeFeynman(
  params: {
    topic: string;
    nodeLabel: string;
    subPoint: string;
    reference: string;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<FeynmanJudgement>) => void,
): Promise<FeynmanJudgement> {
  return judge({ kind: "judge", mode: "feynman", ...params }, onVerdict);
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

export function fetchJudgeCrucible(
  params: {
    topic: string;
    nodeLabel: string;
    problem: string;
    hint: string;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<CrucibleJudgement>) => void,
): Promise<CrucibleJudgement> {
  return judge({ kind: "judge", mode: "crucible", ...params }, onVerdict);
}

/** Maps a free-text answer onto a closed option list (the open-ended half of
 *  placement, the Consume hook, and the Feynman fix pass). */
export interface ChoiceJudgement {
  index: number;
  response: string;
}

export function fetchJudgeChoice(
  params: {
    topic: string;
    nodeLabel?: string;
    question: string;
    options: string[];
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<ChoiceJudgement>) => void,
): Promise<ChoiceJudgement> {
  return judge({ kind: "judge", mode: "choice", ...params }, onVerdict);
}
