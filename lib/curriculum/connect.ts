// ---- Phase 4 · Connect (the Elaboration station) --------------------------
// Durable encoding through *elaboration*: the learner wires the new node into
// concepts they already own. The links are real — candidates are pulled from
// this learner's mastered nodes, not generic trivia — so every connection is
// personal and true, and each confirmed link drafts a card for Retain.
//
// The encoding method is *auto-detected*: conceptual material gets elaboration
// and the mnemonic tool stays hidden (a mnemonic there is noise); genuinely
// list-like material — sequences, taxonomies, vocab — unlocks method-of-loci /
// acronym / vivid-association tools instead. Content ships the Linear
// Transformations pass (conceptual, per the design) plus the Gaussian
// Elimination procedure (list-like) so the conditional is real, not decorative.
import { StateMap } from "./replan";
import { ConceptNode } from "./types";
import { Language } from "@/lib/i18n";

/** The Connect phase's violet palette (its accent everywhere it appears). */
export const CONNECT_COLOR = {
  accent: "#7a5a82",
  soft: "rgba(122,90,130,0.08)",
  border: "rgba(122,90,130,0.35)",
  glow: "rgba(122,90,130,0.26)",
} as const;

/** How the app encodes a node — the auto-detected choice the whole phase turns on. */
export type EncodingKind = "conceptual" | "list-like";

/** A candidate prior node to link to — a real mastered node from the map. */
export interface ElaborationLink {
  /** The prior node's id (must be a mastered node the learner already owns). */
  id: string;
  label: string;
  /** Placement in the 560×440 concept-web canvas. */
  x: number;
  y: number;
  /** The relationship draft pulled from the map — accepted or rewritten. */
  rel: string;
}

/** One offered memory aid, shown only when the content is detected as list-like. */
export interface MnemonicOption {
  /** Method-of-loci · Acronym · Vivid image — the tool kind. */
  kind: string;
  /** The aid's short title (e.g. the acronym itself). */
  title: string;
  /** The generated aid, editable before the learner accepts it. */
  body: string;
}

/** Everything the Connect surface needs for one node's elaboration pass. */
export interface ElaborationContent {
  centerId: string;
  centerLabel: string;
  /** The auto-detected encoding — drives whether the mnemonic tool appears. */
  encoding: EncodingKind;
  /** The detector's plain-language rationale, shown in the method panel. */
  detectNote: string;
  /** The current node's spot in the concept web. */
  center: { x: number; y: number };
  /** Candidate prior nodes to link — drawn from the learner's mastered map. */
  cands: ElaborationLink[];
  /** The ordered/enumerated items a mnemonic organizes (list-like only). */
  items?: string[];
  /** The offered memory aids (list-like only). */
  mnemonics?: MnemonicOption[];
}

/** The three memory aids shown struck-through when the content is conceptual. */
export const MNEMONIC_TOOLS_OFF = ["Memory palace", "Acronym", "Vivid image"] as const;

const MNEMONIC_TOOLS_OFF_PT = [
  "Palácio da memória",
  "Acrônimo",
  "Imagem vívida",
] as const;

/**
 * The tool's name in the learner's language. The generator writes `kind` in
 * English — the prompt fixes the three it may answer — and what the learner
 * reads is not the model's to choose. Anything else is shown as written, which
 * beats a blank label over a real aid.
 */
const MNEMONIC_TOOL_NAMES: Record<string, { en: string; "pt-BR": string }> = {
  acronym: { en: "Acronym", "pt-BR": "Acrônimo" },
  "method of loci": { en: "Memory palace", "pt-BR": "Palácio da memória" },
  "memory palace": { en: "Memory palace", "pt-BR": "Palácio da memória" },
  "vivid image": { en: "Vivid image", "pt-BR": "Imagem vívida" },
};

export function mnemonicToolName(kind: string, lang: Language = "en"): string {
  return MNEMONIC_TOOL_NAMES[kind.trim().toLowerCase()]?.[lang] ?? kind;
}

/** Language-aware struck-through mnemonic tool names. */
export function mnemonicToolsOff(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? MNEMONIC_TOOLS_OFF_PT : MNEMONIC_TOOLS_OFF;
}

/** The live state of one Connect session — held by AtlasApp, read by the view. */
export interface ConnectSession {
  nodeId: string;
  /** The candidate whose linking prompt is open, or null (idle). */
  active: string | null;
  /** The relationship draft per candidate — seeded from the map, then edited. */
  drafts: Record<string, string>;
  /** Which links the learner has confirmed as true. */
  linked: Record<string, boolean>;
  /** The chosen memory aid (index into content.mnemonics), or null (list-like). */
  mnemonicPick: number | null;
  /** The editable mnemonic text — the learner accepts or rewrites the aid. */
  mnemonicDraft: string;
  /** True once the learner accepts the aid — it then drafts its own card. */
  mnemonicAccepted: boolean;
  /** The judge's read of each link it was asked to confirm (W1.5). Absent on
   *  every session saved before it, which reads as none ruled. */
  rulings?: Record<string, ConnectRuling>;
}

/** How a link held up: `false` is never confirmed; `vague` is, with the line
 *  saying what it lacks. These sentences become cards rehearsed for months. */
export interface ConnectRuling {
  verdict: "true" | "vague" | "false";
  line: string;
}

export function connectStart(nodeId: string): ConnectSession {
  return {
    nodeId,
    active: null,
    drafts: {},
    linked: {},
    mnemonicPick: null,
    mnemonicDraft: "",
    mnemonicAccepted: false,
  };
}

export type ConnectAction =
  | { type: "select"; id: string }
  | { type: "draft"; id: string; value: string }
  | { type: "confirm"; id: string; ruling?: ConnectRuling }
  | { type: "pickMnemonic"; index: number }
  | { type: "draftMnemonic"; value: string }
  | { type: "acceptMnemonic" };

/** The fewest words a link has to say before confirming it means anything —
 *  one real clause, not "they are related". */
export const CONNECT_MIN_WORDS = 6;

const said = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Is this draft the learner's own link? Long enough to say something, and not
 * the map's suggestion pasted back — reading a plausible sentence and
 * confirming it is recognition, and encodes almost nothing.
 */
export function connectDraftReady(
  draft: string | undefined,
  suggestion: string,
): boolean {
  const own = (draft ?? "").trim();
  return (
    said(own).split(" ").filter(Boolean).length >= CONNECT_MIN_WORDS &&
    said(own) !== said(suggestion)
  );
}

/**
 * The elaboration engine, as a pure transition. Selecting a candidate opens
 * its linking prompt with a draft pulled from the map; confirming links it;
 * for list-like content the learner can pick a memory aid, edit it, and accept
 * it. Everything confirmed here becomes raw material for cards in Retain.
 */
export function connectReducer(
  session: ConnectSession,
  action: ConnectAction,
  content: ElaborationContent,
): ConnectSession {
  switch (action.type) {
    case "select":
      // Open the prompt blank. The map's suggested relationship is still there
      // (the view offers it on demand, and connectCards falls back to it), but
      // handing it over unasked turns generation into recognition — the learner
      // reads a plausible sentence, confirms, and encodes almost nothing.
      return { ...session, active: action.id };
    case "draft":
      return {
        ...session,
        drafts: { ...session.drafts, [action.id]: action.value },
      };
    case "confirm": {
      // A link is confirmed in the learner's own words or not at all. Two
      // taps on an empty box used to pass the phase on the map's sentence.
      const cand = content.cands.find((c) => c.id === action.id);
      if (!cand || !connectDraftReady(session.drafts[action.id], cand.rel))
        return session;
      const rulings = action.ruling
        ? { ...session.rulings, [action.id]: action.ruling }
        : session.rulings;
      // A link the judge ruled false is not confirmed — and a confirmed one
      // re-worded into something false comes back off.
      const holds = action.ruling?.verdict !== "false";
      return {
        ...session,
        rulings,
        linked: { ...session.linked, [action.id]: holds },
      };
    }
    case "pickMnemonic": {
      const opt = content.mnemonics?.[action.index];
      if (!opt) return session;
      return {
        ...session,
        mnemonicPick: action.index,
        mnemonicDraft: opt.body,
        mnemonicAccepted: false,
      };
    }
    case "draftMnemonic":
      return { ...session, mnemonicDraft: action.value };
    case "acceptMnemonic":
      return session.mnemonicPick === null
        ? session
        : { ...session, mnemonicAccepted: true };
    default:
      return session;
  }
}

/**
 * The prior-concept pool Connect's web is built from: ONLY nodes the learner
 * has actually touched, most-owned first, capped at 8. There is deliberately
 * no fallback to untouched nodes — offering concepts the learner has never met
 * as "things you already know" is the bug elaboration exists to avoid. Empty
 * means Connect has nothing to wire into yet.
 */
const CONNECT_POOL_STATES = ["mastered", "shaky", "learning"];

export function connectPool(
  nodes: ConceptNode[],
  states: StateMap,
  excludeId: string,
): Array<{ id: string; label: string }> {
  return nodes
    .filter(
      (n) =>
        !n.gap && n.id !== excludeId && CONNECT_POOL_STATES.includes(states[n.id] ?? ""),
    )
    .sort(
      (a, b) =>
        CONNECT_POOL_STATES.indexOf(states[a.id] ?? "") -
        CONNECT_POOL_STATES.indexOf(states[b.id] ?? ""),
    )
    .slice(0, 8)
    .map((n) => ({ id: n.id, label: n.label }));
}

/** How many real links the learner has confirmed. */
export function connectLinkedCount(session: ConnectSession): number {
  return Object.values(session.linked).filter(Boolean).length;
}

/**
 * Two real connections is plenty to move on (the design's advance gate) — but
 * a web that only ever offered one candidate can't produce two, and a gate
 * nobody can pass is a dead end, not a standard.
 */
export function connectReady(session: ConnectSession, candCount = Infinity): boolean {
  return connectLinkedCount(session) >= Math.min(2, Math.max(1, candCount));
}

/** A card drafted from the Connect phase — raw material for the Retain queue. */
export interface ConnectCard {
  /** Stable per (node, source) — re-doing the phase must not duplicate cards. */
  key: string;
  front: string;
  back: string;
  kind: "link" | "mnemonic";
}

// U+FE0E after the arrow: bare U+2194 defaults to *emoji* presentation on iOS
// and Android, so the card's front rendered a blue arrow glyph in the middle of
// a serif sentence, on the phone and in the review queue behind it.
const CONNECT_CARD_COPY = {
  en: {
    link: (center: string, cand: string) =>
      `${center} \u2194\ufe0e ${cand}: what’s the connection?`,
    mnemonic: (center: string) => `${center} · what’s the order of the steps?`,
  },
  "pt-BR": {
    link: (center: string, cand: string) =>
      `${center} \u2194\ufe0e ${cand}: qual é a conexão?`,
    mnemonic: (center: string) => `${center} · qual é a ordem dos passos?`,
  },
} as const;

/**
 * The cards this session drafts: one per confirmed link, plus the accepted
 * memory aid when the content is list-like. This is the "tedious step humans
 * skip," done automatically — the phase's write-back into Retain.
 */
export function connectCards(
  session: ConnectSession,
  content: ElaborationContent,
  lang: Language = "en",
): ConnectCard[] {
  const copy = CONNECT_CARD_COPY[lang];
  const cards: ConnectCard[] = content.cands
    // The learner's own sentence and nothing else: the map's suggestion is
    // never a card back (W1.5). A link confirmed without words drafts nothing.
    .filter((c) => session.linked[c.id] && session.drafts[c.id]?.trim())
    .map((c) => ({
      key: `${content.centerId}-connect-${c.id}`,
      front: copy.link(content.centerLabel, c.label),
      back: session.drafts[c.id].trim(),
      kind: "link" as const,
    }));
  if (
    content.encoding === "list-like" &&
    session.mnemonicAccepted &&
    session.mnemonicDraft.trim()
  ) {
    cards.push({
      key: `${content.centerId}-connect-mnemonic`,
      front: copy.mnemonic(content.centerLabel),
      back: session.mnemonicDraft.trim(),
      kind: "mnemonic",
    });
  }
  return cards;
}
