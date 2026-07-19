// The single content-generation endpoint. The browser posts a kind + context;
// the server prompts OpenRouter and returns validated content in the exact
// shapes the client renders. The API key stays server-side.

import { NextResponse } from "next/server";
import {
  generateConnect,
  generateConsume,
  generateCrucible,
  generateCurriculum,
  generateFeynman,
  generateRetain,
  generateSocratic,
} from "@/lib/server/generate";
import { OpenRouterError } from "@/lib/server/openrouter";
import type { GoalKind } from "@/lib/curriculum";

// Content generation is a real LLM round-trip — allow it time.
export const maxDuration = 120;

interface GenerateBody {
  kind:
    | "curriculum"
    | "consume"
    | "socratic"
    | "feynman"
    | "connect"
    | "crucible"
    | "retain";
  topic?: string;
  goal?: GoalKind;
  interests?: string;
  nodeId?: string;
  nodeLabel?: string;
  prereqLabels?: string[];
  masteredLabels?: string[];
  pool?: Array<{ id: string; label: string }>;
  nodes?: Array<{ id: string; label: string; state: string }>;
  budgetMin?: number;
}

const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const labels = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const topic = s(body.topic).trim();
  const interests = s(body.interests);
  const nodeId = s(body.nodeId);
  const nodeLabel = s(body.nodeLabel);
  if (!topic)
    return NextResponse.json({ error: "topic is required" }, { status: 400 });

  try {
    switch (body.kind) {
      case "curriculum": {
        const goal: GoalKind = ["exam", "project", "mastery"].includes(
          s(body.goal),
        )
          ? (body.goal as GoalKind)
          : "mastery";
        return NextResponse.json(
          await generateCurriculum({ topic, goal, interests }),
        );
      }
      case "consume": {
        if (!nodeLabel) throw badRequest("nodeLabel is required");
        return NextResponse.json({
          chunks: await generateConsume({
            topic,
            nodeLabel,
            prereqLabels: labels(body.prereqLabels),
            interests,
          }),
        });
      }
      case "socratic": {
        if (!nodeLabel) throw badRequest("nodeLabel is required");
        return NextResponse.json({
          steps: await generateSocratic({ topic, nodeLabel, interests }),
        });
      }
      case "feynman": {
        if (!nodeId || !nodeLabel) throw badRequest("nodeId and nodeLabel are required");
        return NextResponse.json({
          beats: await generateFeynman({ topic, nodeId, nodeLabel, interests }),
        });
      }
      case "connect": {
        if (!nodeId || !nodeLabel) throw badRequest("nodeId and nodeLabel are required");
        const pool = Array.isArray(body.pool)
          ? body.pool.filter(
              (p): p is { id: string; label: string } =>
                typeof p === "object" &&
                p !== null &&
                typeof p.id === "string" &&
                typeof p.label === "string",
            )
          : [];
        if (pool.length === 0) throw badRequest("pool must list prior nodes");
        return NextResponse.json({
          content: await generateConnect({ topic, nodeId, nodeLabel, pool, interests }),
        });
      }
      case "crucible": {
        if (!nodeId || !nodeLabel) throw badRequest("nodeId and nodeLabel are required");
        return NextResponse.json({
          content: await generateCrucible({
            topic,
            nodeId,
            nodeLabel,
            masteredLabels: labels(body.masteredLabels),
            interests,
          }),
        });
      }
      case "retain": {
        const nodes = Array.isArray(body.nodes)
          ? body.nodes.filter(
              (n): n is { id: string; label: string; state: string } =>
                typeof n === "object" &&
                n !== null &&
                typeof n.id === "string" &&
                typeof n.label === "string" &&
                typeof n.state === "string",
            )
          : [];
        if (nodes.length === 0) throw badRequest("nodes must list learned nodes");
        const budgetMin =
          typeof body.budgetMin === "number" && body.budgetMin >= 3
            ? Math.min(30, Math.round(body.budgetMin))
            : 8;
        return NextResponse.json({
          content: await generateRetain({ topic, budgetMin, nodes, interests }),
        });
      }
      default:
        return NextResponse.json(
          { error: `unknown kind "${String(body.kind)}"` },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof BadRequest)
      return NextResponse.json({ error: err.message }, { status: 400 });
    const message =
      err instanceof Error ? err.message : "content generation failed";
    const status = err instanceof OpenRouterError ? err.status : 502;
    console.error(`[generate:${body.kind}]`, message);
    return NextResponse.json({ error: message }, { status });
  }
}

class BadRequest extends Error {}
function badRequest(message: string): BadRequest {
  return new BadRequest(message);
}
