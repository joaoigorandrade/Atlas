// Checks and code-only fixes for an SVG figure drawn with the library in
// ./svgSymbols.ts: label collisions, clipping, and — for a circuit — wiring
// against the model's own netlist, so a miswired drawing is never shown.

import { SYMBOLS, type Box, type Pt } from "./svgSymbols";

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
const num = (tag: string, name: string): number | undefined => {
  const v = attr(tag, name);
  return v === undefined ? undefined : parseFloat(v);
};
/** Straight segments of every <path>/<line> the model drew (M/L/H/V, absolute
 *  or relative; curves and arcs are skipped — they are arrows and loops). */
function wires(svg: string): Array<[Pt, Pt]> {
  const segs: Array<[Pt, Pt]> = [];
  for (const [tag] of svg.matchAll(/<line\b[^>]*>/gi)) {
    const c = ["x1", "y1", "x2", "y2"].map((k) => num(tag, k) ?? 0);
    segs.push([[c[0], c[1]], [c[2], c[3]]]);
  }
  for (const [tag] of svg.matchAll(/<path\b[^>]*>/gi)) {
    // A filled shape (an arrowhead) is not a wire.
    const fill = attr(tag, "fill");
    if (fill && fill !== "none") continue;
    const d = attr(tag, "d") ?? "";
    let at: Pt = [0, 0];
    let start: Pt = [0, 0];
    let cmd = "";
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    for (let i = 0; i < toks.length; ) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const n = (k: number) => toks.slice(i, i + k).map(Number);
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "M" || C === "L") {
        const [x, y] = n(2);
        i += 2;
        const to: Pt = rel ? [at[0] + x, at[1] + y] : [x, y];
        if (C === "L") segs.push([at, to]);
        at = to;
        if (C === "M") {
          start = to;
          cmd = rel ? "l" : "L"; // implicit lineto after moveto
        }
      } else if (C === "H" || C === "V") {
        const [v] = n(1);
        i += 1;
        const to: Pt = C === "H" ? [rel ? at[0] + v : v, at[1]] : [at[0], rel ? at[1] + v : v];
        segs.push([at, to]);
        at = to;
      } else {
        // A curve or arc: skip its numbers, track only where it ends.
        const k = { C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[C] ?? 0;
        const v = n(k);
        i += k;
        // Z (or junk) followed by a stray number: step over it, never stall.
        if (!k && i < toks.length && !/[a-zA-Z]/.test(toks[i])) i++;
        if (k) at = rel ? [at[0] + v[k - 2], at[1] + v[k - 1]] : [v[k - 2], v[k - 1]];
        if (C === "Z") {
          segs.push([at, start]);
          at = start;
        }
      }
    }
  }
  return segs.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
}

const onSeg = (p: Pt, [a, b]: [Pt, Pt], tol = 1.5) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) <= tol;
};
/** Does a segment pass through a box's interior? (Sampled: wires are short.) */
const crosses = ([a, b]: [Pt, Pt], box: Box) => {
  for (let t = 0; t <= 1; t += 1 / 64) {
    const x = a[0] + t * (b[0] - a[0]);
    const y = a[1] + t * (b[1] - a[1]);
    if (x > box[0] && x < box[2] && y > box[1] && y < box[3]) return true;
  }
  return false;
};

const hit = (a: Box, b: Box, pad = 0) =>
  a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;

/**
 * The drawing against the model's own netlist. Wires join where an end lies
 * on another wire or a pin (crossings do not join); every ground symbol is
 * one node. Each declared net must come out as one drawn node, and no drawn
 * node may hold two declared nets — a split net or a short is caught even
 * when every pin touches some wire.
 */
function netProblems(
  svg: string,
  segs: Array<[Pt, Pt]>,
  pins: Array<{ name: string; at: Pt; ref?: string; ground: boolean }>,
): string[] {
  const declared = /<!--\s*nets\s*:([\s\S]*?)-->/i.exec(svg)?.[1];
  if (!declared) return ["no nets comment: write <!-- nets: ... --> before drawing"];
  const out: string[] = [];
  for (const p of pins) if (!p.ref) out.push(`the ${p.name} has no id`);

  const up = new Map<string, string>();
  const find = (k: string): string => {
    const u = up.get(k) ?? k;
    if (u === k) return k;
    const r = find(u);
    up.set(k, r);
    return r;
  };
  const join = (a: string, b: string) => up.set(find(a), find(b));
  const close = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1.5;
  segs.forEach((w, i) =>
    segs.forEach((o, j) => {
      if (i < j && (w.some((e) => onSeg(e, o)) || o.some((e) => onSeg(e, w))))
        join(`s${i}`, `s${j}`);
    }),
  );
  pins.forEach((p, i) => {
    const key = p.ref ?? `?${i}`;
    if (p.ground) join(key, "ground");
    segs.forEach((w, j) => onSeg(p.at, w) && join(key, `s${j}`));
    pins.forEach((q, j) => j > i && close(p.at, q.at) && join(key, q.ref ?? `?${j}`));
  });

  const ids = new Set(pins.map((p) => p.ref).filter(Boolean));
  const netOf = new Map<string, string>();
  for (const part of declared.split(";")) {
    const [name, list = ""] = part.split("=").map((t) => t.trim());
    if (!name) continue;
    const refs = list.split(",").map((t) => t.trim()).filter(Boolean);
    for (const r of refs) {
      if (!ids.has(r)) out.push(`net ${name} names ${r}, which is not a placed pin`);
      else netOf.set(r, name);
    }
    const roots = new Set(refs.filter((r) => ids.has(r)).map(find));
    if (roots.size > 1) out.push(`net ${name} is drawn split: ${refs.join(", ")} are not all wired together`);
  }
  for (const r of ids) if (!netOf.has(r!)) out.push(`${r} is in no net`);

  const byRoot = new Map<string, Set<string>>();
  for (const [r, n] of netOf) {
    const root = find(r);
    byRoot.set(root, (byRoot.get(root) ?? new Set()).add(n));
  }
  for (const nets of byRoot.values())
    if (nets.size > 1) out.push(`nets ${[...nets].join(" and ")} are shorted together by the drawing`);
  return out;
}

/** A problem that makes the figure wrong, not just crowded: a circuit with a
 *  floating pin or a shorted symbol must not be shown at all. */
export const isWiringProblem = (p: string): boolean =>
  /touches no wire|runs through|not a predefined|has a transform|connects to nothing|^nets? |^no nets comment|is in no net$|has no id$|drawing is empty/.test(
    p,
  );

type Label = { text: string; box: Box; x: number; y: number; at: number; tag: string };

/** Everything the checks and the tidier read off a drawing. */
function parse(svg: string) {
  const problems: string[] = [];
  const ownIds = new Set([...svg.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const placed: Array<{ name: string; box: Box }> = [];
  const pins: Array<{ name: string; at: Pt; ref?: string; ground: boolean }> = [];
  for (const [tag] of svg.matchAll(/<use\b[^>]*>/gi)) {
    const ref = (attr(tag, "href") ?? attr(tag, "xlink:href") ?? "").replace(/^#/, "");
    const sym = SYMBOLS[ref];
    if (!sym) {
      if (!ownIds.has(ref)) problems.push(`#${ref} is not a predefined symbol`);
      continue;
    }
    if (attr(tag, "transform"))
      problems.push(`<use href="#${ref}"> has a transform; use x/y and an orientation name`);
    const x = num(tag, "x") ?? 0;
    const y = num(tag, "y") ?? 0;
    const id = attr(tag, "id");
    sym.pins.forEach(([px, py], k) =>
      pins.push({
        name: `pin ${k} of the ${ref} at (${x},${y})`,
        at: [x + px, y + py],
        ref: id && `${id}.${k}`,
        ground: ref === "ground",
      }),
    );
    if (!sym.box) continue;
    const [x0, y0, x1, y1] = sym.box;
    placed.push({ name: `${ref} at (${x},${y})`, box: [x + x0, y + y0, x + x1, y + y1] });
  }

  const labels: Label[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const tag = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    const x = num(tag, "x");
    const y = num(tag, "y");
    if (!text || x === undefined || y === undefined) continue;
    labels.push({ text, box: labelBox(tag, text, x, y), x, y, at: m.index!, tag });
  }

  const vb = (attr(/<svg\b[^>]*>/i.exec(svg)?.[0] ?? "", "viewBox") ?? "0 0 800 600")
    .split(/[\s,]+/)
    .map(Number);
  const canvas: Box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  return { problems, placed, pins, segs: wires(svg), labels, canvas };
}

/** ponytail: text width is estimated (0.58 em per character) — a real
 *  text-metrics pass if labels still collide in renders. */
function labelBox(tag: string, text: string, x: number, y: number): Box {
  const fs = num(tag, "font-size") ?? 22;
  const w = [...text].length * fs * 0.58;
  const anchor = attr(tag, "text-anchor");
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return [left, y - fs * 0.75, left + w, y + fs * 0.2];
}
const shift = (b: Box, dx: number, dy: number): Box => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];

/** Offsets a crowded label may move by, nearest first (at most 40px, so it
 *  stays by what it names). */
const NUDGES: Pt[] = [];
for (let dx = -40; dx <= 40; dx += 10)
  for (let dy = -40; dy <= 40; dy += 10) if (Math.hypot(dx, dy) <= 40) NUDGES.push([dx, dy]);
NUDGES.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));

/**
 * Layout fixes that need no model: each label that sits on a symbol, a wire
 * or an earlier label moves to the nearest free spot within 40px, and the
 * viewBox grows to hold everything, so nothing is clipped. Wiring is never
 * touched.
 */
export function tidyFigure(svg: string): string {
  const { placed, segs, labels, canvas } = parse(svg);
  const free = (b: Box, done: Box[]) =>
    !placed.some((s) => hit(b, s.box, 2)) &&
    !segs.some((w) => crosses(w, b)) &&
    !done.some((d) => hit(b, d, 4));
  const done: Box[] = [];
  const moves = new Map<number, Pt>();
  for (const l of labels) {
    // A node or pin name (A, B, 1, E…) means WHERE it is: never moved.
    const fixed = [...l.text].length <= 2;
    const at = (!fixed && NUDGES.find(([dx, dy]) => free(shift(l.box, dx, dy), done))) || [0, 0];
    if (at[0] || at[1]) moves.set(l.at, at);
    done.push(shift(l.box, at[0], at[1]));
  }

  let out = svg.replace(/<text\b([^>]*)>/gi, (whole, tag: string, offset: number) => {
    const m = moves.get(offset);
    if (!m) return whole;
    return whole
      .replace(/(\sx\s*=\s*["'])([^"']*)/, (_, a, v) => a + (parseFloat(v) + m[0]))
      .replace(/(\sy\s*=\s*["'])([^"']*)/, (_, a, v) => a + (parseFloat(v) + m[1]));
  });

  const all: Box[] = [...done, ...placed.map((s) => s.box), ...segs.map(([a, b]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as Box)];
  const fit: Box = all.reduce<Box>(
    (u, b) => [Math.min(u[0], b[0] - 20), Math.min(u[1], b[1] - 20), Math.max(u[2], b[2] + 20), Math.max(u[3], b[3] + 20)],
    canvas,
  );
  if (fit.some((v, i) => v !== canvas[i]))
    out = out.replace(/<svg\b[^>]*>/i, (open) => {
      const vb = `viewBox="${fit[0]} ${fit[1]} ${fit[2] - fit[0]} ${fit[3] - fit[1]}"`;
      return /\sviewBox\s*=/.test(open)
        ? open.replace(/viewBox\s*=\s*["'][^"']*["']/, vb)
        : open.replace(/<svg\b/i, `<svg ${vb}`);
    });
  return out;
}

/**
 * What a reader would see wrong, in words the model can act on: unknown
 * symbols, labels on top of each other, a symbol or a wire, labels off the
 * canvas, pins that touch no wire, wire ends that go nowhere, wires drawn
 * through a symbol, and — against the model's own netlist — split nets and
 * shorts, the wrong-but-connected circuits no local rule can see.
 */
export function figureProblems(svg: string): string[] {
  const { problems, placed, pins, segs, labels, canvas } = parse(svg);
  const body = svg.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<(use|path|line|polyline|polygon|circle|ellipse|rect|text)\b/i.test(body))
    return ["the drawing is empty"];
  if (/<!--\s*nets\s*:/i.test(svg) && !pins.length)
    problems.push("nets are declared but no circuit symbols are placed");

  labels.forEach((a, i) => {
    if (a.box[0] < canvas[0] || a.box[1] < canvas[1] || a.box[2] > canvas[2] || a.box[3] > canvas[3])
      problems.push(`label "${a.text}" runs off the canvas`);
    for (const b of labels.slice(i + 1))
      if (hit(a.box, b.box, 4)) problems.push(`label "${a.text}" overlaps label "${b.text}"`);
    for (const s of placed)
      if (hit(a.box, s.box, 2)) problems.push(`label "${a.text}" sits on the ${s.name}`);
    if (segs.some((w) => crosses(w, a.box))) problems.push(`label "${a.text}" sits on a wire`);
  });

  for (const p of pins)
    if (
      !segs.some((w) => onSeg(p.at, w)) &&
      !pins.some((q) => q !== p && Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) <= 1.5)
    )
      problems.push(`${p.name} (${p.at.join(",")}) touches no wire`);
  // Only a circuit (pinned symbols placed) has wiring to check; a graph's
  // axes or a geometry figure's free lines end where they like.
  if (pins.length) {
    // A wire end must land on a pin or another wire (open ends on a terminal).
    const loose = new Set<string>();
    segs.forEach((w, i) =>
      w.forEach((end) => {
        const joined =
          segs.some((o, j) => j !== i && onSeg(end, o)) ||
          pins.some((q) => Math.hypot(q.at[0] - end[0], q.at[1] - end[1]) <= 1.5);
        if (!joined) loose.add(end.join(","));
      }),
    );
    for (const e of loose) problems.push(`a wire end at (${e}) connects to nothing`);
    problems.push(...netProblems(svg, segs, pins));
  }

  for (const s of placed) {
    const inner: Box = [s.box[0] + 3, s.box[1] + 3, s.box[2] - 3, s.box[3] - 3];
    if (segs.some((w) => crosses(w, inner)))
      problems.push(`a wire runs through the ${s.name}; wires must stop at its pins`);
  }
  return problems;
}
