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

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || !data)
    throw new Error(data?.error ?? `generation failed (${res.status})`);
  return data;
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

export async function fetchConsume(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
}): Promise<ConsumeChunk[]> {
  return (await post<{ chunks: ConsumeChunk[] }>({ kind: "consume", ...params }))
    .chunks;
}

export async function fetchSocratic(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
}): Promise<SocraticStep[]> {
  return (await post<{ steps: SocraticStep[] }>({ kind: "socratic", ...params }))
    .steps;
}

export async function fetchFeynman(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
}): Promise<FeynmanBeat[]> {
  return (await post<{ beats: FeynmanBeat[] }>({ kind: "feynman", ...params }))
    .beats;
}

export async function fetchConnect(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  pool: Array<{ id: string; label: string }>;
  interests: string;
}): Promise<ElaborationContent> {
  return (
    await post<{ content: ElaborationContent }>({ kind: "connect", ...params })
  ).content;
}

export async function fetchCrucible(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  masteredLabels: string[];
  interests: string;
}): Promise<CrucibleContent> {
  return (
    await post<{ content: CrucibleContent }>({ kind: "crucible", ...params })
  ).content;
}

export async function fetchRetain(params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string }>;
  interests: string;
}): Promise<RetainContent> {
  return (
    await post<{ content: RetainContent }>({ kind: "retain", ...params })
  ).content;
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
