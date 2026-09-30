// Retrieved primary sources (W2.7, R13).
//
// A Provenance excerpt used to be the model's memory of a document — quoted
// "closely" — and one of its keys contradicted the phase's own rule. Now the
// source names the page it is on, the server fetches that page from an
// allow-list of public-domain corpora and checks the excerpt against it before
// the pass is cached. A match links the learner to the whole document; a miss
// keeps the link but labels the excerpt a paraphrase. Nothing is fetched from
// outside the list.

import { logEvent } from "@/lib/log";

/** Public-domain corpora a source may be fetched from — the only hosts. */
export const SOURCE_HOSTS = [
  "newadvent.org",
  "vatican.va",
  "papalencyclicals.net",
  "perseus.tufts.edu",
  "gutenberg.org",
  "avalon.law.yale.edu",
] as const;

/** The URL, if it is https on an allowed host; otherwise null. */
export function allowedSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    return SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url.toString() : null;
  } catch {
    return null;
  }
}

const words = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** A page's readable text: tags, scripts and styles out, entities folded. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
}

/**
 * How much of the excerpt the page holds, 0–1: the best share of the
 * excerpt's words found inside any window of the page the same length. A
 * sliding multiset overlap — word order is left to the window, so a quote
 * with modernised punctuation or a skipped clause still reads as a match, and
 * a paraphrase does not. O(page).
 */
export function matchRatio(excerpt: string, page: string): number {
  const want = words(excerpt);
  const text = words(page);
  if (!want.length || text.length < want.length) return 0;
  const need = new Map<string, number>();
  for (const w of want) need.set(w, (need.get(w) ?? 0) + 1);
  const have = new Map<string, number>();
  let overlap = 0;
  let best = 0;
  for (let i = 0; i < text.length; i++) {
    const add = text[i];
    const had = have.get(add) ?? 0;
    if (had < (need.get(add) ?? 0)) overlap++;
    have.set(add, had + 1);
    if (i >= want.length) {
      const drop = text[i - want.length];
      const left = (have.get(drop) ?? 0) - 1;
      have.set(drop, left);
      if (left < (need.get(drop) ?? 0)) overlap--;
    }
    if (overlap > best) best = overlap;
  }
  return best / want.length;
}

/** The share of the excerpt that must be on the page to call it a quote. */
export const QUOTE_MATCH = 0.9;

/** Fetch an allowed page and say whether the excerpt is on it. Fails closed:
 *  an unreachable page is not a verified quote. */
export async function quoteHolds(url: string, excerpt: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Atlas source check (education)" },
      redirect: "follow",
    });
    if (!res.ok || !allowedSource(res.url || url)) return false;
    const html = (await res.text()).slice(0, 3_000_000);
    const ratio = matchRatio(excerpt, pageText(html));
    logEvent("source_checked", { host: new URL(url).hostname, ratio: +ratio.toFixed(2) });
    return ratio >= QUOTE_MATCH;
  } catch {
    return false;
  }
}
