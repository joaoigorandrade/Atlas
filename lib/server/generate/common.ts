// The content engine: one generator per content kind. Each builds a prompt,
// asks OpenRouter for JSON (generateJson validates + retries once), then
// post-processes into the exact shapes the client renders — layout, ids, and
// gap offsets are computed here, never trusted from the model.

// ---- tiny validation helpers (throw readable errors for the retry loop) ----
import type { Language } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/server/openrouter";

export function fail(msg: string): never {
  throw new Error(msg);
}

export function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(`${name} must be an object`);
  return v as Record<string, unknown>;
}

export function arr(v: unknown, name: string, min = 1, max = 40): unknown[] {
  if (!Array.isArray(v)) fail(`${name} must be an array`);
  if (v.length < min || v.length > max)
    fail(`${name} must have ${min}-${max} items (got ${v.length})`);
  return v;
}

export function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) fail(`${name} must be a non-empty string`);
  return v.trim();
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const s = str(v, name);
  if (!allowed.includes(s as T))
    fail(`${name} must be one of ${allowed.join(", ")} (got "${s}")`);
  return s as T;
}

// Phrases from our own prompt templates that must never appear verbatim in
// generated learner-facing labels — a match means the model echoed the
// template instead of writing a concrete answer (#10).
//
// This is the backstop, not the fix. The cause was that the shapes shipped
// their placeholders as plausible-looking *values*, so returning the blank
// looked like filling it in; each shape now carries a filled-in worked example
// instead. Entries stay in step with whatever placeholder wording the shapes
// currently use.
export const TEMPLATE_ECHOES = [
  "a complete, precise answer",
  "a hand-wave",
  "you'll feel it",
  "just trust it",
  "confidently wrong answer",
  "a real misconception",
  "what the learner says",
  "a common misconception as",
  "the learner's reply, in their own words",
  "written out in their voice",
];

export function rejectEcho(label: string, name: string): string {
  const lower = label.toLowerCase();
  for (const phrase of TEMPLATE_ECHOES)
    if (lower.includes(phrase))
      fail(
        `${name} echoes the prompt template ("${phrase}") — write the concrete answer itself, not a description of it`,
      );
  return label;
}

/** Reject "X instead of X" non-errors — a named error must actually differ (#10).
 *  Observed live: "resulting in [4, 2] instead of [4, 2]". */
export function rejectSelfIdenticalError(text: string, name: string): string {
  const lower = text.toLowerCase();
  const marker = " instead of ";
  const idx = lower.indexOf(marker);
  if (idx === -1) return text;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const before = norm(lower.slice(0, idx));
  const tail = norm(
    lower.slice(idx + marker.length).split(/[.;!?]|,\s(?:so|which|and)\b/)[0] ?? "",
  );
  if (tail && before.endsWith(tail)) {
    // Token boundary: "…wrote 16 instead of 6" must not match on the "6".
    const ch = before[before.length - tail.length - 1] ?? " ";
    if (!/[a-z0-9]/.test(ch))
      fail(
        `${name} names an error where before and after are identical ("${tail}") — describe a real, different error`,
      );
  }
  return text;
}

export const SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You are the content engine of Atlas, a mastery-learning platform built on a living concept map. " +
    "You produce rigorous, honest pedagogy: precise definitions, desirable difficulties, anti-sycophancy " +
    "(wrong reasoning is caught and named, never smoothed over). " +
    "Reply with ONLY one valid JSON object — no markdown fences, no prose before or after.",
};

export function user(content: string): ChatMessage[] {
  return [SYSTEM, { role: "user", content }];
}

// Server-safe copy of lib/i18n.tsx's type — that file is "use client" and
// must never be imported from server code, so this is redeclared here (the
// base engine file) and re-exported for lib/server/job.ts to use.

/** Appended to every prompt. Field NAMES stay English (the app parses fixed
 *  keys) — only the natural-language VALUES the model writes should switch.
 *
 *  The explicit "don't copy the template" clause is load-bearing: the schemas
 *  above spell their example values out in English ("Novel transfer · a
 *  framing you were never handed", "Method of loci"), and without it the model
 *  echoes those verbatim and then writes the whole payload in English to
 *  match. */
export function languageNote(language: Language | undefined): string {
  return language === "pt-BR"
    ? '\n\nOUTPUT LANGUAGE: Brazilian Portuguese (pt-BR). Every natural-language string value you return must be written in Portuguese — including any label, tag, title or example text shown in the JSON template above. Translate those; never copy their English wording. Keep only JSON field names and enum values (e.g. "correct", "mastered", "conceptual", "list-like") exactly as specified in English.'
    : "";
}

/**
 * The sizing rule every sized generation shares.
 *
 * These prompts used to hand the model a count — 5 sections, 4 beats, 12-18
 * concepts — and a count reads as a quota: material worth three sections comes
 * back as five, two of which restate the others. The learner pays for that
 * twice, in the wait for a generation no cache can hide and again in the
 * reading. So every sized prompt asks for a RANGE and says what each end
 * actually means, which is what makes stopping early a correct answer rather
 * than a shortfall.
 */
export function sizeRule(p: {
  /** Plural noun for what is being counted — "sections", "beats". */
  unit: string;
  min: number;
  max: number;
  /** What genuinely earns the small end. */
  atMin: string;
  /** What genuinely earns the large end. */
  atMax: string;
}): string {
  return `SIZE — read it off the material, never off a quota: write ${p.min}-${p.max} ${p.unit}. ${p.min} is the right answer for ${p.atMin}; only ${p.atMax} earns ${p.max}. Add one only when it carries something none of the others do. Covering the material in ${p.min} and stopping is a correct answer, not a shortfall — padding to reach ${p.max} makes this worse, not more thorough.`;
}

/** Personal-interest flavoring shared by several prompts. */
export function interestNote(interests: string): string {
  return interests.trim()
    ? `Where an analogy helps, draw it from the learner's stated interests (${interests.trim()}) — but only when it genuinely fits.`
    : "Use concrete, everyday analogies when they genuinely fit.";
}

/**
 * The concept's boundary on the map: what the other passes already taught and
 * what they are going to. Every per-node generation gets this, because without
 * it each one is written as if its concept were the only thing on the map —
 * re-deriving a prerequisite three columns back, or teaching the next concept
 * before the learner ever clicks it.
 *
 * `prior` is licence, not an instruction to cover: build on it freely, never
 * re-teach it. `later` is a fence: name it in one clause if the connection is
 * genuinely load-bearing, never explain it.
 */
export function boundaryNote(params: {
  priorLabels?: string[];
  laterLabels?: string[];
}): string {
  const prior = (params.priorLabels ?? []).filter(Boolean);
  const later = (params.laterLabels ?? []).filter(Boolean);
  if (!prior.length && !later.length) return "";
  const lines = [
    "",
    "THE MAP AROUND THIS CONCEPT — the learner is working through a whole map, and every other concept on it has its own pass. Stay inside this one:",
  ];
  if (prior.length)
    lines.push(
      `- Already taught, earlier on the map: ${prior.join(", ")}. Assume all of it and build on it — refer to it by name, never re-explain or re-derive it. A recap of one of those is material the learner has already read.`,
    );
  if (later.length)
    lines.push(
      `- Taught later, by their OWN pass: ${later.join(", ")}. These are not yours. Do not explain, define, derive or work an example of any of them; at most name one in a single clause to say where this leads ("which is what X builds on"). Anything you teach here the learner meets again as a repeat.`,
    );
  lines.push(
    "- Anything the concept genuinely needs that appears in NEITHER list is yours to teach, in as much depth as it earns.",
  );
  return lines.join("\n") + "\n";
}
