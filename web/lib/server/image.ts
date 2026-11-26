// Image generation for visual worked examples, through the same OpenRouter
// account as every text call (see ./openrouter.ts for the key and base URL).
//
// Env:
//   OPENROUTER_IMAGE_MODEL — image model slug, or "off" to disable images

import { decide, noul, sureNoul } from "@/lib/server/decide";
import { figureProblems, isWiringProblem, tidyFigure } from "@/lib/server/svgFigure";
import { SYMBOL_GUIDE, withSymbols } from "@/lib/server/svgSymbols";
import {
  apiKey,
  authHeaders,
  BASE_URL,
  OpenRouterError,
  providerError,
  REQUEST_MS,
} from "@/lib/server/openrouter";

/** The image model, or null when switched off (`OPENROUTER_IMAGE_MODEL=off`). */
export function imageModel(): string | null {
  const m = process.env.OPENROUTER_IMAGE_MODEL || "microsoft/mai-image-2.7-flash";
  return m === "off" ? null : m;
}

/** The house style every example image is drawn in — appended, never left to
 *  the content model, so a pass can't talk the picture into a poster. */
const IMAGE_STYLE =
  "Style: clean textbook schematic, black ink lines on a plain white background, flat, no shading, no decorative text, no title, no sentences; labels only as short tags (values, component or point names).";

/**
 * One image, one call. Deliberately no retry and no fallback model: every
 * attempt is billed, and a missing picture costs the learner nothing — the
 * worked steps stand on their own. The caller caches what comes back.
 */
export async function generateImage(
  prompt: string,
): Promise<{ bytes: Buffer; mime: string; cost: number | null }> {
  const model = imageModel();
  if (!model) throw new OpenRouterError("image generation is off", 404);
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey()),
    signal: AbortSignal.timeout(REQUEST_MS),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `${prompt}\n\n${IMAGE_STYLE}` }],
      // Image-only model: asking for "text" too routes to no endpoint.
      modalities: ["image"],
      image_config: { aspect_ratio: "4:3" },
    }),
  });
  if (!res.ok) throw await providerError(res);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    usage?: { cost?: number };
  };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) throw new OpenRouterError("OpenRouter returned no image", 502);
  console.log(
    JSON.stringify({
      evt: "generate",
      kind: "image",
      model,
      ms: Date.now() - started,
      cost: data.usage?.cost ?? null,
    }),
  );
  return {
    mime: m[1],
    bytes: Buffer.from(m[2], "base64"),
    cost: data.usage?.cost ?? null,
  };
}

// ---- SVG instead of a raster draw --------------------------------------------
//
// Env:
//   OPENROUTER_SVG_MODEL     — the text model that writes the SVG, or "off"
//   OPENROUTER_SVG_REASONING — its reasoning effort (default "low")

const svgModel = (): string | null => {
  const m = process.env.OPENROUTER_SVG_MODEL || "openai/gpt-6-luna";
  return m === "off" ? null : m;
};

/** Jev's call: is this figure a line schematic an SVG can show (a circuit,
 *  a diagram, a geometric figure)? Null keeps the image model — Jev unsure,
 *  a realistic picture, or a graph on axes: models compute curve points
 *  wrong even at medium reasoning (tested), so plots stay a raster draw.
 *  ponytail: a plot spec rendered by code would make graphs exact. */
export async function svgPlan(prompt: string): Promise<{ effort: string } | null> {
  if (!svgModel()) return null;
  const a = await decide(
    { figure_request: prompt },
    {
      svg: noul(
        "Could a careful author hand-write this figure as a simple SVG — lines, shapes, arrows, standard symbols (circuit, geometry, diagram, table) and short labels — and have it look RIGHT? Answer no when it needs realism: a photo-like scene, anything living (a cell, organelles, an organism, anatomy), a face, a landscape, a textured or shaded object.",
        "Yes: a line schematic shows it fully.",
        "No: it needs a picture a line schematic cannot give.",
      ),
      plot: noul(
        "Does the figure plot a function, curve or data on axes, so that points must land at exact computed coordinates?",
        "Yes: it is a graph on axes.",
        "No: it is a schematic, a diagram or a geometric figure.",
      ),
    },
    "figure-svg",
  );
  if (sureNoul(a?.svg) !== true || sureNoul(a?.plot) !== false) return null;
  return { effort: process.env.OPENROUTER_SVG_REASONING || "low" };
}

/** Anything that could run or fetch when the file is opened on its own. The
 *  learner sees it through <img> (inert), but a signed URL can be opened in a tab. */
const UNSAFE_SVG =
  /<script|<foreignObject|\son\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)/i;

/** The route has 60s (`maxDuration`); a slow SVG must give up while a ~10s
 *  raster fallback still fits. */
const SVG_MS = 40_000;
/** A corrective retry only starts if this much of the budget is left. */
const RETRY_MIN_MS = 15_000;

const SVG_SYSTEM = [
  'You draw textbook figures as SVG. Reply with ONLY one <svg> element: xmlns="http://www.w3.org/2000/svg", viewBox="0 0 800 600", no width/height, no <script>, no external links or images, no <foreignObject>. Everything inside the viewBox with a 30px margin.',
  "Draw only what the figure asks for: never write results or answers worked out in the steps.",
  SYMBOL_GUIDE,
].join("\n\n");

type Msg = { role: "system" | "user" | "assistant"; content: string };

/** One completion; returns the <svg> it holds (or "") and what it cost. */
async function svgCall(model: string, messages: Msg[], ms: number, effort: string) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey()),
    signal: AbortSignal.timeout(ms),
    body: JSON.stringify({
      model,
      temperature: 0,
      // Measured: default reasoning was 60% of the tokens and 3x the time;
      // the library leaves only placement to plan, which low still does.
      reasoning: { effort },
      messages,
    }),
  });
  if (!res.ok) throw await providerError(res);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const svg = /<svg[\s\S]*<\/svg>/i.exec(text)?.[0] ?? "";
  return { svg: UNSAFE_SVG.test(svg) ? "" : svg, cost: data.usage?.cost ?? 0 };
}

/**
 * An SVG from the text model, same contract as `generateImage`: throws on
 * anything unusable so the caller falls back to a draw. The model places
 * predefined symbols; `figureProblems` then checks the layout, and one
 * corrective call — only when the budget still allows — gets to fix it.
 * The fewer-problems draft wins; one still miswired throws, so the route
 * falls back to the raster draw.
 */
export async function generateSvg(
  prompt: string,
  effort = "low",
): Promise<{ bytes: Buffer; mime: string; cost: number | null }> {
  const model = svgModel();
  if (!model) throw new OpenRouterError("svg is off", 404);
  const started = Date.now();
  const messages: Msg[] = [
    { role: "system", content: SVG_SYSTEM },
    { role: "user", content: `${prompt}\n\n${IMAGE_STYLE}` },
  ];
  const first = await svgCall(model, messages, SVG_MS, effort);
  // Includes the model's own NONE: a part the library lacks goes to a draw.
  if (!first.svg) throw new OpenRouterError("model returned no usable SVG", 502);
  // Code fixes what it can (label spots, clipping) before any retry is spent.
  const draft = tidyFigure(first.svg);
  let best = { svg: draft, problems: figureProblems(draft) };
  let cost = first.cost;
  const left = SVG_MS - (Date.now() - started);
  const firstProblems = best.problems.length;
  if (firstProblems && left >= RETRY_MIN_MS) {
    const fix = await svgCall(
      model,
      [
        ...messages,
        { role: "assistant", content: draft },
        {
          role: "user",
          content: `Fix these problems and reply with the whole corrected <svg>, changing nothing else:\n- ${best.problems.join("\n- ")}`,
        },
      ],
      left,
      effort,
    ).catch(() => null);
    if (fix) cost += fix.cost;
    const fixed = fix?.svg ? tidyFigure(fix.svg) : "";
    const problems = fixed ? figureProblems(fixed) : [];
    // Fewer WIRING problems wins first: a crowded but correct circuit beats a
    // tidy miswired one.
    const score = (p: string[]) => p.filter(isWiringProblem).length * 1000 + p.length;
    if (fixed && score(problems) < score(best.problems)) best = { svg: fixed, problems };
  }
  console.log(
    JSON.stringify({
      evt: "generate",
      kind: "svg",
      model,
      ms: Date.now() - started,
      cost,
      problems: [firstProblems, best.problems.length],
    }),
  );
  // Crowded labels still teach; a miswired circuit teaches the wrong thing.
  if (best.problems.some(isWiringProblem))
    throw new OpenRouterError(
      `SVG still miswired: ${best.problems.filter(isWiringProblem)[0]}`,
      502,
    );
  return { mime: "image/svg+xml", bytes: Buffer.from(withSymbols(best.svg)), cost };
}
