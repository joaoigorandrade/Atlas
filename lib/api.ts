// Client helper for the content-generation endpoint. Every screen that needs
// AI content goes through here; failures surface as thrown `AtlasError`s
// carrying a code, which is what lets the caller say something true about them
// in the learner's language instead of relaying an upstream string.

import type {
  AltKey,
  ConsumeChunk,
  ConsumeModelBeat,
  CrucibleContent,
  DiagnosticDifficulty,
  DiagnosticQuestion,
  ElaborationContent,
  FeynmanBeat,
  GoalKind,
  MapNode,
  RetainContent,
  SocraticStep,
} from "@/lib/curriculum";
import { AtlasError, codeForStatus, isErrorCode, toAtlasError } from "@/lib/errors";
import type { Language } from "@/lib/i18n";
import { logWarning } from "@/lib/log";
import { withRetry } from "@/lib/retry";

/** Options every content fetcher accepts. `prefetch` marks a background warm:
 *  a warm that fails comes back as a silent 204 rather than an error, since
 *  nobody is watching it, and the caller treats that as a no-op. */
export interface FetchOpts {
  prefetch?: boolean;
}

/**
 * A background warm the server declined — swallowed by the warm queue.
 *
 * It extends `AtlasError` so it is two things at once: `instanceof WarmDeclined`
 * still works for the callers that branch on it (`AtlasApp`'s `generate`), and
 * `toAtlasError` hands it back *by identity* rather than re-wrapping it, so
 * passing it through the retry helper or a generic catch can't quietly turn a
 * control-flow signal into a failure.
 */
export class WarmDeclined extends AtlasError {
  constructor() {
    super("declined", "prefetch declined", { status: 204 });
    this.name = "WarmDeclined";
  }
}

/** Turn a non-OK response into a classified error, preferring the server's own
 *  code over one guessed from the status. The body's `error` string is kept as
 *  the technical message — for logs, never for the screen. */
async function failure(res: Response): Promise<AtlasError> {
  const requestId = res.headers.get("x-atlas-request-id") ?? undefined;
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    reason?: string;
  } | null;
  const code = isErrorCode(body?.code) ? body.code : codeForStatus(res.status);
  return new AtlasError(code, body?.error ?? `request failed (${res.status})`, {
    status: res.status,
    requestId,
    reason: body?.reason,
  });
}

async function postOnce<T>(body: Record<string, unknown>, opts?: FetchOpts): Promise<T> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts?.prefetch ? { ...body, prefetch: true } : body),
  });
  if (res.status === 204) throw new WarmDeclined();
  if (!res.ok) throw await failure(res);
  const data = (await res.json().catch(() => null)) as T | null;
  if (!data)
    throw new AtlasError("upstream", "empty response body", {
      status: res.status,
      requestId: res.headers.get("x-atlas-request-id") ?? undefined,
    });
  return data;
}

/**
 * One automatic retry, and only for the codes where a second attempt is a
 * different roll of the dice — a dropped connection, a throttle, a 502.
 *
 * Deliberately not more: every attempt past a cache miss is a real model call,
 * and a learner who is owed an explanation is better served by a "Try again"
 * they can choose than by the app spending their credit three times in silence.
 * `WarmDeclined` is not retryable, so a declined warm still returns instantly.
 */
function post<T>(body: Record<string, unknown>, opts?: FetchOpts): Promise<T> {
  return withRetry(() => postOnce<T>(body, opts), { delays: [1200] });
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
    // Still degrades to "no hits" — that is the correct behaviour for a warm
    // nobody is watching. What changes is that it is no longer *invisible*: a
    // batch endpoint that is down used to be indistinguishable from a cold
    // cache, so the app would quietly regenerate everything, forever.
    if (!res.ok) {
      logWarning("content_batch_failed", await failure(res));
      return {};
    }
    const data = (await res.json()) as { hits?: Record<number, unknown> };
    return data.hits ?? {};
  } catch (err) {
    logWarning("content_batch_failed", toAtlasError(err));
    return {};
  }
}

/** The map on the wire: a flat list of laid-out nodes, each carrying its own
 *  prerequisites. `graphFromMapNodes` turns it into a `ConceptGraph` — and does
 *  so meaningfully over a *partial* list, which is what lets the canvas paint
 *  mid-stream. */
export interface CurriculumMapPayload {
  nodes: MapNode[];
}

/** Too-broad topics come back as scoped sub-map offers instead of a map (#30). */
export interface ScopeOffer {
  label: string;
  note: string;
}

export type CurriculumMapResult = CurriculumMapPayload | { scopes: ScopeOffer[] };

export interface CurriculumParams {
  topic: string;
  goal: GoalKind;
  /** Coverage share when goal is "pareto" — smaller, higher-leverage map. */
  paretoPct?: number;
  outline?: string;
  language?: Language;
}

/**
 * The onboarding build's only blocking call, streamed one concept at a time.
 *
 * This is the one generation in the app that can never be warmed — the node
 * ids don't exist until it returns — so it is also the only one where the
 * learner watches the decode happen. `onNodes` fires per concept with every
 * node so far, so `build()` can paint a real (if partial) map instead of
 * waiting on the last edge of the last node.
 *
 * A node can arrive twice: once as it is written, and again in the settling
 * pass that re-centres each column now that its height is known. `collectFrames`
 * replaces by index, so the second arrival patches the first.
 */
export async function fetchCurriculumMapStream(
  params: CurriculumParams,
  onNodes: (nodes: MapNode[]) => void,
): Promise<CurriculumMapResult> {
  // Replace by index, never append — the settling pass re-sends slots that
  // already landed, and a fresh array each time is what React re-renders on.
  const live: MapNode[] = [];
  const frames = await fetchStream({ kind: "curriculum", ...params }, (frame) => {
    if (frame.p !== "nodes" || !("i" in frame)) return;
    live[frame.i] = frame.v as MapNode;
    onNodes(live.filter((n) => n !== undefined));
  });
  const scopes = collectFrames<ScopeOffer>(frames, "scopes");
  if (scopes.length > 0) return { scopes };
  return { nodes: collectFrames<MapNode>(frames, "nodes") };
}

export interface DiagnosticQuestionParams {
  topic: string;
  goal: GoalKind;
  interests: string;
  language?: Language;
  /** Concept nodes this question may probe — already-asked ones excluded. */
  pool: Array<{ id: string; label: string }>;
  difficulty: DiagnosticDifficulty;
}

/**
 * One placement question at the given difficulty. Called again only once the
 * learner has answered the previous one — the next difficulty is a function
 * of that answer (see `stepDifficulty` in lib/curriculum.ts), so the
 * questions can't be pre-fetched as a batch.
 */
export function fetchDiagnosticQuestion(
  params: DiagnosticQuestionParams,
): Promise<DiagnosticQuestion> {
  return post<DiagnosticQuestion>({ kind: "diagnosticQuestion", ...params });
}

// Each fetcher pairs with a `<kind>Request` builder returning the exact body
// it posts. The builders are what `fetchCachedContent` batches, which is how a
// warm addresses the same cache row the real call would.

/**
 * The one sentence the node rail says about a concept, for a node whose map
 * arrived without it (a run built before summaries, or a sentence the map
 * generation dropped). Everything else about a node is on the map already —
 * this is the only thing that has to be written.
 */
export const summaryRequest = (params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  language?: Language;
}) => ({ kind: "summary", ...params });

export async function fetchSummary(
  params: Parameters<typeof summaryRequest>[0],
  opts?: FetchOpts,
): Promise<string> {
  return (await post<{ summary: string }>(summaryRequest(params), opts)).summary;
}

export const consumeRequest = (params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
  /** The concepts around this one on the map: what earlier passes already
   *  taught, and what later ones own. Keeps a pass inside its own concept
   *  instead of re-teaching a prerequisite or spoiling the next node. */
  priorLabels?: string[];
  laterLabels?: string[];
}) => ({ kind: "consume", ...params });

export async function fetchConsume(
  params: Parameters<typeof consumeRequest>[0],
  opts?: FetchOpts,
): Promise<ConsumeChunk[]> {
  return (await post<{ chunks: ConsumeChunk[] }>(consumeRequest(params), opts)).chunks;
}

/** One slot of a payload, as it comes off the NDJSON wire. Mirrors
 *  `lib/server/stream.ts`'s `StreamFrame` — declared here too so client code
 *  never imports from `lib/server`.
 *
 *  `partial: true` is a redraw of the slot being written right now — the
 *  token-by-token layer. Render it; never keep it. A complete frame for the
 *  same slot always follows, and `collectFrames` drops the drafts. */
export type StreamFrame =
  | { p: string; v: unknown; partial?: true }
  | { p: string; i: number; v: unknown; partial?: true };

/** Mirrors `ERROR_PART` in lib/server/stream.ts — declared here too for the
 *  same reason `StreamFrame` is: client code never imports from lib/server.
 *  The two must stay in step; `tests/streamError.test.ts` asserts they do. */
export const ERROR_PART = "__error";

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
  if (!res.ok) throw await failure(res);
  const requestId = res.headers.get("x-atlas-request-id") ?? undefined;
  if (!res.body)
    throw new AtlasError("upstream", "no response body", {
      status: res.status,
      requestId,
    });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames: StreamFrame[] = [];
  /** Set by the terminal `__error` frame — the server telling us, after it had
   *  already committed to a 200, that the rest is not coming. */
  let streamError: AtlasError | null = null;
  let buf = "";

  const takeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame: StreamFrame;
    try {
      frame = JSON.parse(trimmed) as StreamFrame;
    } catch (err) {
      // A malformed line used to throw a raw SyntaxError that travelled all the
      // way to the toast. One bad line is not a reason to discard a stream that
      // is otherwise landing — skip it and let the shape check decide.
      logWarning("stream_line_unparsable", err, {
        line: trimmed.slice(0, 120),
      });
      return;
    }
    if (frame.p === ERROR_PART) {
      const v = (frame.v ?? {}) as {
        code?: string;
        message?: string;
        requestId?: string;
      };
      streamError = new AtlasError(
        isErrorCode(v.code) ? v.code : "upstream",
        v.message ?? "the stream ended early",
        { requestId: v.requestId ?? requestId },
      );
      return;
    }
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

  // Order matters: the error frame is the more specific complaint, and a stream
  // that died before its first frame would otherwise be reported as "empty".
  //
  // Frames that already landed have been handed to `onFrame` and are on screen.
  // Throwing here does not take them back — every progressive caller keeps its
  // `live*` state — it just stops the caller from treating a half-written
  // reading pass as a finished one, which is what used to happen.
  if (streamError) throw streamError;
  if (frames.length === 0)
    throw new AtlasError("upstream", "generation produced no frames", {
      requestId,
    });
  return frames;
}

/** Fold the indexed frames of one list part into an array, replacing by index
 *  so a re-sent slot patches rather than duplicates. */
export function collectFrames<T>(frames: StreamFrame[], part: string): T[] {
  const out: T[] = [];
  for (const f of frames) {
    if (f.p !== part || f.partial || !("i" in f)) continue;
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
    if (frame.p === "chunks" && "i" in frame) onChunk(frame.v as ConsumeChunk, frame.i);
  });
  return collectFrames<ConsumeChunk>(frames, "chunks");
}

/** One lens over one section of the reading — what a Consume control opens.
 *  The section's own text is part of the request (and so of the cache key):
 *  the walkthrough is written for the exact prose on screen behind it. */
export const modelRequest = (params: {
  topic: string;
  nodeLabel: string;
  lens: AltKey;
  kicker: string;
  sectionBody: string[];
  takeaway: string;
  interests: string;
  language?: Language;
}) => ({ kind: "model", ...params });

export async function fetchConsumeModel(
  params: Parameters<typeof modelRequest>[0],
  opts?: FetchOpts,
): Promise<ConsumeModelBeat[]> {
  return (await post<{ beats: ConsumeModelBeat[] }>(modelRequest(params), opts)).beats;
}

/**
 * Foreground model view: beats land one at a time — and each one paints as it
 * is written, since the server redraws the in-progress beat at its own index.
 * That is what lets the view open on its first sentence instead of its last
 * beat. Background warms (the same lens on the next section, once a learner has
 * shown which one they reach for) stay on `fetchConsumeModel`.
 */
export async function fetchConsumeModelStream(
  params: Parameters<typeof modelRequest>[0],
  onBeat: (beat: ConsumeModelBeat, index: number) => void,
): Promise<ConsumeModelBeat[]> {
  const frames = await fetchStream(modelRequest(params), (frame) => {
    if (frame.p === "beats" && "i" in frame) onBeat(frame.v as ConsumeModelBeat, frame.i);
  });
  return collectFrames<ConsumeModelBeat>(frames, "beats");
}

/**
 * "Ask about this" — the learner's own question about a stretch of prose they
 * highlighted, answered against that section and streamed a paragraph at a
 * time. Never warmed and never cached: the inputs are one learner's selection
 * and one learner's words.
 *
 * `onPart` fires as the paragraph is *written*, not only when it lands: the
 * server redraws the in-progress paragraph at the same index every ~66ms, so
 * the aside fills in word by word rather than sitting empty until the whole
 * answer is done — which matters more here than anywhere else in Consume, since
 * the reading is still on screen behind it. Callers replace by index (drafts
 * and the final paragraph share one), and `PassageAsk.status` says when it's
 * finished; only the resolved array is the answer.
 */
export async function fetchPassageStream(
  params: {
    topic: string;
    nodeLabel: string;
    kicker: string;
    section: string;
    selection: string;
    question: string;
    language?: Language;
  },
  onPart: (part: string, index: number) => void,
): Promise<string[]> {
  const frames = await fetchStream({ kind: "passage", ...params }, (frame) => {
    if (frame.p === "answer" && "i" in frame) onPart(frame.v as string, frame.i);
  });
  return collectFrames<string>(frames, "answer");
}

export const socraticRequest = (params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  /** The concepts around this one on the map: what earlier passes already
   *  taught, and what later ones own. Keeps a pass inside its own concept
   *  instead of re-teaching a prerequisite or spoiling the next node. */
  priorLabels?: string[];
  laterLabels?: string[];
}) => ({ kind: "socratic", ...params });

export async function fetchSocratic(
  params: Parameters<typeof socraticRequest>[0],
  opts?: FetchOpts,
): Promise<SocraticStep[]> {
  return (await post<{ steps: SocraticStep[] }>(socraticRequest(params), opts)).steps;
}

/** Foreground Socratic: the tutor's first probe renders as soon as it's
 *  written, the rest follow. Background warms stay on `fetchSocratic`. */
export async function fetchSocraticStream(
  params: Parameters<typeof socraticRequest>[0],
  onStep: (step: SocraticStep, index: number) => void,
): Promise<SocraticStep[]> {
  const frames = await fetchStream(socraticRequest(params), (frame) => {
    if (frame.p === "steps" && "i" in frame) onStep(frame.v as SocraticStep, frame.i);
  });
  return collectFrames<SocraticStep>(frames, "steps");
}

export const feynmanRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  /** The concepts around this one on the map: what earlier passes already
   *  taught, and what later ones own. Keeps a pass inside its own concept
   *  instead of re-teaching a prerequisite or spoiling the next node. */
  priorLabels?: string[];
  laterLabels?: string[];
}) => ({ kind: "feynman", ...params });

export async function fetchFeynman(
  params: Parameters<typeof feynmanRequest>[0],
  opts?: FetchOpts,
): Promise<FeynmanBeat[]> {
  return (await post<{ beats: FeynmanBeat[] }>(feynmanRequest(params), opts)).beats;
}

/** Foreground Feynman: the first beat opens the teach-back, the rest follow.
 *  This is the largest payload of any phase, so it gains the most. */
export async function fetchFeynmanStream(
  params: Parameters<typeof feynmanRequest>[0],
  onBeat: (beat: FeynmanBeat, index: number) => void,
): Promise<FeynmanBeat[]> {
  const frames = await fetchStream(feynmanRequest(params), (frame) => {
    if (frame.p === "beats" && "i" in frame) onBeat(frame.v as FeynmanBeat, frame.i);
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
  return (await post<{ content: ElaborationContent }>(connectRequest(params), opts))
    .content;
}

export const crucibleRequest = (params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  masteredLabels: string[];
  interests: string;
  language?: Language;
  /** The concepts around this one on the map: what earlier passes already
   *  taught, and what later ones own. Keeps a pass inside its own concept
   *  instead of re-teaching a prerequisite or spoiling the next node. */
  priorLabels?: string[];
  laterLabels?: string[];
}) => ({ kind: "crucible", ...params });

export async function fetchCrucible(
  params: Parameters<typeof crucibleRequest>[0],
  opts?: FetchOpts,
): Promise<CrucibleContent> {
  return (await post<{ content: CrucibleContent }>(crucibleRequest(params), opts))
    .content;
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
  return (await post<{ content: RetainContent }>(retainRequest(params), opts)).content;
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
 *
 * `onDraft` is the same deal one level finer: the critique as it is typed, so
 * the bubble the verdict opened fills in word by word instead of swapping from
 * dots to a finished paragraph. It carries `response` and nothing else — a
 * half-written verdict would be a different classification than the one the
 * model settles on, and the verdict is what drives mastery writes.
 */
async function judge<T>(
  body: Record<string, unknown>,
  onVerdict?: (partial: Partial<T>) => void,
  onDraft?: (draft: Partial<T>) => void,
): Promise<T> {
  let seen = 0;
  let last: T | null = null;
  const frames = await fetchStream(body, (frame) => {
    if (frame.p !== "judgement") return;
    if (frame.partial) {
      onDraft?.(frame.v as Partial<T>);
      return;
    }
    // Only the first complete frame is the verdict prefix. Which frame is
    // *last* isn't knowable until the stream ends, so the resolved value comes
    // from the collected frames below rather than from this callback.
    if (seen++ === 0) onVerdict?.(frame.v as Partial<T>);
  });
  for (const frame of frames)
    if (frame.p === "judgement" && !frame.partial) last = frame.v as T;
  if (!last) throw new AtlasError("upstream", "the judge returned nothing");
  return last;
}

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
  /** The wrong idea in a few words, on a caught "near"/"wrong" — filed into the
   *  run's misconception roll-up so a repeat can be named as one. */
  misconception?: string;
}

export function fetchJudgeSocratic(
  params: {
    topic: string;
    nodeLabel: string;
    question: string;
    reference: string;
    answer: string;
    history?: Array<{ role: "ai" | "learner"; text: string }>;
    attempt?: number;
    misconceptions?: Array<{ label: string; quality: string }>;
    /** What this learner keeps getting wrong run-wide (`recurringMisconceptions`). */
    recurring?: string[];
    help?: number;
    language?: Language;
  },
  onVerdict?: (partial: Partial<SocraticJudgement>) => void,
  onDraft?: (draft: Partial<SocraticJudgement>) => void,
): Promise<SocraticJudgement> {
  return judge({ kind: "judge", mode: "socratic", ...params }, onVerdict, onDraft);
}

export interface FeynmanJudgement {
  /** One ruling per rubric row, by index — `quote` carries the learner's own
   *  words on a gap, so the map can say them back. */
  verdicts: Array<{
    i: number;
    verdict: "good" | "skipped" | "confused";
    quote?: string;
  }>;
  response: string;
  /** Terms they used but never unpacked. */
  jargon: string[];
}

export function fetchJudgeFeynman(
  params: {
    topic: string;
    nodeLabel: string;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<FeynmanJudgement>) => void,
  onDraft?: (draft: Partial<FeynmanJudgement>) => void,
): Promise<FeynmanJudgement> {
  return judge({ kind: "judge", mode: "feynman", ...params }, onVerdict, onDraft);
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

// ---- read-aloud -----------------------------------------------------------

/** One word of a clip: `from`/`to` index into the text that was sent, `at`/`end`
 *  are milliseconds into the audio. Mirrors `SpeechMark` in lib/server/tts.ts —
 *  restated here because that module is server-only and this one runs in the
 *  browser. */
export interface SpeechMark {
  from: number;
  to: number;
  at: number;
  end: number;
}

export interface SpeechClip {
  /** base64 mp3. */
  audio: string;
  marks: SpeechMark[];
}

/**
 * Synthesize one segment of prose. `text` must already be the plain spoken
 * string (`spokenText()` from lib/rich) — the offsets that come back index
 * into exactly what was sent.
 *
 * No retry wrapper: read-aloud is a foreground action the learner triggered,
 * and the control surfaces the failure with a retry they can choose. Spending
 * a second synthesis behind their back is the thing the character bill is
 * most sensitive to.
 */
export async function fetchSpeech(params: {
  text: string;
  language: Language;
}): Promise<SpeechClip> {
  const res = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await failure(res);
  const data = (await res.json().catch(() => null)) as SpeechClip | null;
  if (!data?.audio)
    throw new AtlasError("upstream", "speech response carried no audio", {
      status: res.status,
      requestId: res.headers.get("x-atlas-request-id") ?? undefined,
    });
  return { audio: data.audio, marks: data.marks ?? [] };
}
