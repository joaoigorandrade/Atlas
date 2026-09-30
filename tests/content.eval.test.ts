// The eval panel (W0.3): content correctness and the shape of the four
// research flows, measured against the LIVE content model. Gated behind
// RUN_EVAL like `judge.eval.test.ts`, so CI and `npm test` stay offline:
//
//   RUN_EVAL=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/content.eval.test.ts
//
// It calls the generators directly — no cache, no database — which is the
// method the research (docs/RESEARCH-LEARNER-FLOWS.md) used. Four reports:
//   1. keys   — every closed item blind-solved; disputed rate per kind × domain
//   2. tags   — kind/domain/cell per node; a map spanning > 2 domains is flagged
//   3. shape  — DAG width (a >8-node map of width 1 is a chain); phase-minute
//               hours against the pace model
//   4. locale and notation — jurisdiction terms on locale-bound topics, LaTeX
//               on formal ones
// The report lands in `scratch/eval/` and is printed; the baseline goes under
// "Baselines" in docs/PLAN-LEARNING.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import {
  CELL_BUDGET,
  PHASE_MINUTES,
  cellOf,
  conceptBoundary,
  graphFromMapNodes,
  planGates,
  type GoalKind,
  type MapNode,
  type PhaseId,
} from "@/lib/curriculum";
import {
  VERIFY,
  blindSolve,
  checkItem,
  disputedIds,
  generateConsume,
  generateDiscriminate,
  generateDrill,
  generateMap,
  generatePredict,
  generateProvenance,
  generateTrace,
} from "@/lib/server/generate";
import type { Language } from "@/lib/i18n";

const live = !!process.env.RUN_EVAL && !!process.env.OPENROUTER_API_KEY;

interface PanelTopic {
  topic: string;
  goal: GoalKind;
  language: Language;
  paretoPct?: number;
  /** What the flows care about on this topic. */
  expect?: { locale?: RegExp; latex?: boolean };
}

/** Two per domain, en and pt-BR, including the four research topics. */
export const PANEL: PanelTopic[] = [
  { topic: "Linear algebra", goal: "exam", language: "en", expect: { latex: true } },
  { topic: "Probabilidade", goal: "mastery", language: "pt-BR", expect: { latex: true } },
  { topic: "Git version control", goal: "pareto", paretoPct: 50, language: "en" },
  { topic: "Python para análise de dados", goal: "exam", language: "pt-BR" },
  { topic: "Human cardiovascular physiology", goal: "exam", language: "en" },
  { topic: "Mudanças climáticas", goal: "pareto", paretoPct: 50, language: "pt-BR" },
  { topic: "Igreja Antiga", goal: "mastery", language: "pt-BR" },
  { topic: "The French Revolution", goal: "mastery", language: "en" },
  { topic: "Espanhol para viagem", goal: "pareto", paretoPct: 20, language: "pt-BR" },
  { topic: "Conversational Italian", goal: "pareto", paretoPct: 20, language: "en" },
  {
    topic: "Finanças pessoais",
    goal: "pareto",
    paretoPct: 20,
    language: "pt-BR",
    expect: { locale: /tesouro|cdi|selic|fgc|imposto de renda|\bIR\b/gi },
  },
  { topic: "Sourdough baking", goal: "project", language: "en" },
];

type ClosedKind = "discriminate" | "predict" | "trace" | "drill" | "provenance";
const CLOSED: Record<ClosedKind, (p: never) => Promise<unknown>> = {
  discriminate: generateDiscriminate,
  predict: generatePredict,
  trace: generateTrace,
  drill: generateDrill,
  provenance: generateProvenance,
};

/** Nodes per map whose closed items are generated and solved. */
const NODES_PER_MAP = Number(process.env.EVAL_NODES ?? 2);

async function evalTopic(t: PanelTopic) {
  const map = (await generateMap({
    topic: t.topic,
    goal: t.goal,
    paretoPct: t.paretoPct,
    language: t.language,
  })) as { nodes?: MapNode[]; scopes?: unknown };
  if (!map.nodes) return { topic: t.topic, scoped: true };
  const nodes = map.nodes;
  const graph = graphFromMapNodes(nodes);
  const domains = [...new Set(nodes.map((n) => n.domain ?? "general"))];
  const byG = new Map<number, number>();
  for (const n of nodes) byG.set(n.g, (byG.get(n.g) ?? 0) + 1);
  const width = Math.max(...byG.values());
  const phaseMinutes = nodes.reduce(
    (sum, n) =>
      sum + planGates(n.phasePlan ?? []).reduce((s, p) => s + PHASE_MINUTES[p], 0),
    0,
  );
  const paceMinutes = nodes.reduce(
    (sum, n) => sum + CELL_BUDGET[cellOf(n.importance, n.difficulty)],
    0,
  );

  const keys: Array<{ kind: string; domain: string; items: number; disputed: number }> =
    [];
  let consumeText = "";
  const probe = nodes
    .filter((n) => (n.importance ?? "core") === "core")
    .slice(0, NODES_PER_MAP);
  for (const node of probe) {
    const params = {
      topic: t.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      interests: "",
      language: t.language,
      prereqLabels: [],
      ...conceptBoundary(graph, node.id),
      ...(node.kind && node.kind !== "concept" ? { nodeKind: node.kind } : null),
      ...(node.domain && node.domain !== "general" ? { domain: node.domain } : null),
      cell: cellOf(node.importance, node.difficulty),
    };
    const domain = node.domain ?? "general";
    const jobs: Promise<void>[] = [];
    jobs.push(
      generateConsume(params as never)
        .then(async (chunks) => {
          consumeText += chunks
            .map((c) => [...c.body, JSON.stringify(c.example ?? "")].join(" "))
            .join(" ");
          const items = chunks.map(checkItem).filter((x) => x !== null);
          const solved = await blindSolve({
            topic: t.topic,
            nodeLabel: node.label,
            items,
          });
          keys.push({
            kind: "consume",
            domain,
            items: items.length,
            disputed: disputedIds(items, solved).length,
          });
        })
        .catch(() => {}),
    );
    for (const kind of Object.keys(CLOSED) as ClosedKind[]) {
      if (!(node.phasePlan ?? []).includes(kind as PhaseId)) continue;
      jobs.push(
        CLOSED[kind](params as never)
          .then(async (content) => {
            const { context, items } = VERIFY[kind].items(content as never);
            const solved = await blindSolve({
              topic: t.topic,
              nodeLabel: node.label,
              context,
              items,
            });
            keys.push({
              kind,
              domain,
              items: items.length,
              disputed: disputedIds(items, solved).length,
            });
          })
          .catch(() => {}),
      );
    }
    await Promise.all(jobs);
  }

  return {
    topic: t.topic,
    language: t.language,
    goal: t.goal,
    nodes: nodes.length,
    kinds: count(nodes.map((n) => n.kind ?? "concept")),
    domains,
    tooManyDomains: domains.length > 2,
    cells: count(nodes.map((n) => cellOf(n.importance, n.difficulty))),
    width,
    chain: nodes.length > 8 && width === 1,
    phaseHours: +(phaseMinutes / 60).toFixed(1),
    paceHours: +(paceMinutes / 60).toFixed(1),
    keys,
    localeTerms: t.expect?.locale
      ? (consumeText.match(t.expect.locale) ?? []).length
      : null,
    latex: t.expect?.latex ? /\$[^$]+\$/.test(consumeText) : null,
  };
}

const count = (xs: string[]) =>
  xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});

describe.skipIf(!live)("content eval panel (W0.3)", () => {
  it("measures the panel", { timeout: 3_600_000 }, async () => {
    const only = process.env.EVAL_TOPICS?.split(",").map((s) => s.trim());
    const panel = only ? PANEL.filter((t) => only.includes(t.topic)) : PANEL;
    const results = [];
    // Four at a time: the model's rate limit, not the test, is the ceiling.
    for (let i = 0; i < panel.length; i += 4)
      results.push(
        ...(await Promise.all(
          panel
            .slice(i, i + 4)
            .map((t) =>
              evalTopic(t).catch((e) => ({ topic: t.topic, error: String(e) })),
            ),
        )),
      );
    const rows = results.flatMap((r) => ("keys" in r && r.keys ? r.keys : []));
    const tally: Record<string, [number, number]> = {};
    for (const r of rows) {
      const t = (tally[`${r.kind}·${r.domain}`] ??= [0, 0]);
      t[0] += r.disputed;
      t[1] += r.items;
    }
    const rate = Object.fromEntries(
      Object.entries(tally).map(([k, [d, n]]) => [k, `${d}/${n}`]),
    );
    const total = rows.reduce((a, r) => [a[0] + r.disputed, a[1] + r.items], [0, 0]);
    const report = {
      at: new Date().toISOString(),
      model: process.env.OPENROUTER_MODEL,
      verifyModel:
        process.env.OPENROUTER_VERIFY_MODEL ??
        process.env.OPENROUTER_JUDGE_MODEL ??
        process.env.OPENROUTER_MODEL,
      disputedOverall: `${total[0]}/${total[1]}`,
      disputedByKindDomain: rate,
      topics: results,
    };
    mkdirSync("scratch/eval", { recursive: true });
    const file = `scratch/eval/panel-${report.at.slice(0, 10)}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
});
