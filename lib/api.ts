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

export function fetchCurriculum(params: {
  topic: string;
  goal: GoalKind;
  interests: string;
}): Promise<CurriculumPayload> {
  return post<CurriculumPayload>({ kind: "curriculum", ...params });
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
