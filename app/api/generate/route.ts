// The single content-generation endpoint. The browser posts a kind + context;
// the server prompts OpenRouter and returns validated content in the exact
// shapes the client renders. The API key stays server-side.
//
// Protection (#18): requires a signed-in Supabase session, caps every input
// length, enforces a per-user daily quota and a global monthly call ceiling
// (both counted from the generation_log table), and logs every call.

import { NextResponse } from "next/server";
import {
  generateConnect,
  generateConsume,
  generateCrucible,
  generateCurriculum,
  generateFeynman,
  generateRetain,
  generateSocratic,
  judgeCrucible,
  judgeFeynman,
  judgeSocratic,
} from "@/lib/server/generate";
import { OpenRouterError } from "@/lib/server/openrouter";
import { createClient } from "@/lib/supabase/server";
import type { GoalKind } from "@/lib/curriculum";

// Content generation is a real LLM round-trip — allow it time.
export const maxDuration = 120;

/** Per-user calls per UTC day; a learner's full node spiral is ~7 calls. */
const DAILY_QUOTA = Number(process.env.GENERATION_DAILY_QUOTA || 60);
/** Global calls per month — the hard spend ceiling across all users.
 *  ponytail: counted in calls, not dollars — switch to usage-cost accounting
 *  when a billing feed exists. */
const MONTHLY_CALL_CAP = Number(process.env.GENERATION_MONTHLY_CALL_CAP || 20000);

const QUOTA_MESSAGE =
  "You've hit today's generation limit — it resets at midnight UTC. Your map and cards still work offline of the writer.";

interface GenerateBody {
  kind:
    | "curriculum"
    | "consume"
    | "socratic"
    | "feynman"
    | "connect"
    | "crucible"
    | "retain"
    | "judge";
  topic?: string;
  goal?: GoalKind;
  interests?: string;
  outline?: string;
  nodeId?: string;
  nodeLabel?: string;
  prereqLabels?: string[];
  masteredLabels?: string[];
  pool?: Array<{ id: string; label: string }>;
  nodes?: Array<{ id: string; label: string; state: string }>;
  budgetMin?: number;
  // judge fields
  mode?: "socratic" | "feynman" | "crucible";
  question?: string;
  reference?: string;
  answer?: string;
  subPoint?: string;
  problem?: string;
  hint?: string;
}

// Input caps (#18) — a 100KB "topic" must never reach a prompt.
const CAPS = {
  topic: 200,
  interests: 200,
  nodeLabel: 120,
  outline: 20_000,
  freeText: 4_000, // learner answers/attempts/explanations
  listItems: 30,
} as const;

const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const labels = (v: unknown, max = CAPS.listItems): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .slice(0, max)
        .map((x) => x.slice(0, CAPS.nodeLabel))
    : [];

export async function POST(request: Request) {
  // Auth first: an anonymous caller must never spend OpenRouter credit.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId)
    return NextResponse.json({ error: "sign in to generate content" }, { status: 401 });

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const topic = s(body.topic).trim();
  const interests = s(body.interests).slice(0, CAPS.interests);
  const nodeId = s(body.nodeId).slice(0, CAPS.nodeLabel);
  const nodeLabel = s(body.nodeLabel);
  if (!topic)
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  if (topic.length > CAPS.topic)
    return NextResponse.json(
      { error: `topic is too long (max ${CAPS.topic} characters)` },
      { status: 400 },
    );
  if (nodeLabel.length > CAPS.nodeLabel)
    return NextResponse.json(
      { error: `nodeLabel is too long (max ${CAPS.nodeLabel} characters)` },
      { status: 400 },
    );

  // Quotas: per-user per-day, then the global monthly ceiling.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await supabase
    .from("generation_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart.toISOString());
  if (!countError && (count ?? 0) >= DAILY_QUOTA)
    return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 });
  const { data: monthCount } = await supabase.rpc("generation_calls_this_month");
  if (typeof monthCount === "number" && monthCount >= MONTHLY_CALL_CAP) {
    console.error(
      JSON.stringify({ evt: "spend_ceiling_hit", monthCount, cap: MONTHLY_CALL_CAP }),
    );
    return NextResponse.json(
      { error: "Atlas has reached this month's generation budget — back at the start of the month." },
      { status: 429 },
    );
  }
  // Log before the (long) generation so the quota can't be raced past by
  // firing many concurrent requests. Failures here are non-fatal (the table
  // may lag a migration) but loudly logged.
  const { error: logError } = await supabase
    .from("generation_log")
    .insert({ kind: String(body.kind ?? "unknown").slice(0, 40) });
  if (logError)
    console.error(JSON.stringify({ evt: "generation_log_insert_failed", error: logError.message }));
  console.log(
    JSON.stringify({ evt: "generate_request", user: userId, kind: body.kind }),
  );

  try {
    switch (body.kind) {
      case "curriculum": {
        const goal: GoalKind = ["exam", "project", "mastery"].includes(
          s(body.goal),
        )
          ? (body.goal as GoalKind)
          : "mastery";
        return NextResponse.json(
          await generateCurriculum({
            topic,
            goal,
            interests,
            outline: s(body.outline).slice(0, CAPS.outline),
          }),
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
          ? body.pool
              .filter(
                (p): p is { id: string; label: string } =>
                  typeof p === "object" &&
                  p !== null &&
                  typeof p.id === "string" &&
                  typeof p.label === "string",
              )
              .slice(0, CAPS.listItems)
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
          ? body.nodes
              .filter(
                (n): n is { id: string; label: string; state: string } =>
                  typeof n === "object" &&
                  n !== null &&
                  typeof n.id === "string" &&
                  typeof n.label === "string" &&
                  typeof n.state === "string",
              )
              .slice(0, CAPS.listItems)
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
      case "judge": {
        if (!nodeLabel) throw badRequest("nodeLabel is required");
        const answer = s(body.answer).slice(0, CAPS.freeText);
        if (!answer.trim()) throw badRequest("answer is required");
        if (body.mode === "socratic")
          return NextResponse.json({
            judgement: await judgeSocratic({
              topic,
              nodeLabel,
              question: s(body.question).slice(0, CAPS.freeText),
              reference: s(body.reference).slice(0, CAPS.freeText),
              answer,
            }),
          });
        if (body.mode === "feynman")
          return NextResponse.json({
            judgement: await judgeFeynman({
              topic,
              nodeLabel,
              subPoint: s(body.subPoint).slice(0, CAPS.nodeLabel * 2),
              reference: s(body.reference).slice(0, CAPS.freeText),
              explanation: answer,
            }),
          });
        if (body.mode === "crucible")
          return NextResponse.json({
            judgement: await judgeCrucible({
              topic,
              nodeLabel,
              problem: s(body.problem).slice(0, CAPS.freeText),
              hint: s(body.hint).slice(0, CAPS.freeText),
              attempt: answer,
            }),
          });
        throw badRequest(`unknown judge mode "${String(body.mode)}"`);
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
    console.error(
      JSON.stringify({
        evt: "generate_failed",
        user: userId,
        kind: body.kind,
        status,
        error: message.slice(0, 600),
      }),
    );
    return NextResponse.json({ error: message }, { status });
  }
}

class BadRequest extends Error {}
function badRequest(message: string): BadRequest {
  return new BadRequest(message);
}
