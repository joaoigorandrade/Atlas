"use client";

// A concept's two cost axes, drawn the way an engraved atlas draws a place.
//
// Importance is settlement rank: a concept the learner's goal rests on is a
// city, one they only need to use is a town — a smaller open ring, its name in
// italic, as old atlases set a village. Difficulty is relief: nothing on the
// lowland, one hachured hill, or a small range of peaks up and to the left of
// the city, shaded on the lee side. These are pictorial glyphs, not the relief
// shading `atlasTerrain.ts` removed on purpose — they say "this will take a
// climb" without turning the map back into a heightfield.
//
// All inline SVG strokes, no filters, so each glyph costs what a letter costs.

import type { ConceptNode, NodeDifficulty } from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import type { Language } from "@/lib/i18n";

/** One hachured hill, its foot on y = 0, centred on x = 0. */
function Hill({ x, y, ink }: { x: number; y: number; ink: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-6 0 Q0 -7 6 0" fill="none" stroke={ink} strokeWidth={1} />
      <path
        d="M1 -3 L2.4 -0.4 M2.6 -2.4 L3.9 -0.3 M-0.6 -3.4 L0.6 -0.9"
        stroke={ink}
        strokeWidth={0.55}
      />
    </g>
  );
}

/** One peak, hachured down its right-hand (lee) slope. */
function Peak({ x, y, ink, h = 11 }: { x: number; y: number; ink: string; h?: number }) {
  const at = (dx: number) => -h + (dx / 5.5) * h;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M-5.5 0 L0 ${-h} L5.5 0`}
        fill={color.paper}
        stroke={ink}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <path
        d={[1.3, 2.6, 3.9].map((dx) => `M${dx} ${at(dx) + 1} L${dx} 0`).join(" ")}
        stroke={ink}
        strokeWidth={0.55}
      />
    </g>
  );
}

/**
 * The relief beside a city, in the city's own coordinates (the city at 0,0).
 * Drawn before the city mark so the mark sits in front of the range.
 */
export function Relief({
  difficulty,
  muted,
}: {
  difficulty?: NodeDifficulty;
  muted?: boolean;
}) {
  const ink = muted ? color.inkGhost : color.inkMuted;
  if (difficulty === "hard")
    return (
      <g aria-hidden transform="scale(1.3)">
        <Hill x={-25} y={-5} ink={ink} />
        <Peak x={-19} y={-7} ink={ink} h={9} />
        <Peak x={-12} y={-10} ink={ink} />
      </g>
    );
  // Missing reads as medium, as it does everywhere: the store omits the
  // default on read, so a medium node comes back with no difficulty at all.
  if (difficulty === "easy") return null;
  return (
    <g aria-hidden transform="scale(1.3)">
      <Hill x={-16} y={-9} ink={ink} />
    </g>
  );
}

const WORDS = {
  en: {
    city: "City",
    town: "Town",
    easy: "Lowland",
    medium: "In the hills",
    hard: "In the mountains",
    minutes: (n: number) => `~${n} min left`,
  },
  "pt-BR": {
    city: "Cidade",
    town: "Vila",
    easy: "Planície",
    medium: "Nas colinas",
    hard: "Nas montanhas",
    minutes: (n: number) => `~${n} min restantes`,
  },
} as const;

/** "Town · In the mountains" — the node's two axes in atlas words. */
export function settlementLine(
  node: Pick<ConceptNode, "importance" | "difficulty">,
  lang: Language,
): string {
  const w = WORDS[lang];
  return `${node.importance === "support" ? w.town : w.city} · ${w[node.difficulty ?? "medium"]}`;
}

/** "Learning · Town · In the mountains" — a state label with the node's axes.
 *  A gap is a sub-point of its parent, so it has no rank or relief of its own. */
export function withSettlement(
  label: string,
  node: Pick<ConceptNode, "importance" | "difficulty" | "gap">,
  lang: Language,
): string {
  return node.gap ? label : `${label} · ${settlementLine(node, lang)}`;
}

/** "~38 min left" — what the node still owes, from `minutesLeft`. */
export function minutesLine(minutes: number, lang: Language): string {
  return WORDS[lang].minutes(minutes);
}

/** The legend row: both settlement marks and both relief glyphs, in words. */
export function SettlementLegend({ lang }: { lang: Language }) {
  const w = WORDS[lang];
  const item = (glyph: React.ReactNode, label: string, italic?: boolean) => (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg
        width={30}
        height={22}
        viewBox="-42 -28 50 34"
        aria-hidden
        style={{ overflow: "visible" }}
      >
        {glyph}
      </svg>
      <span style={{ fontStyle: italic ? "italic" : undefined }}>{label}</span>
    </span>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 14,
        fontFamily: font.serif,
        fontSize: 13,
        color: color.inkSoft,
      }}
    >
      {item(<CityMark importance="core" />, w.city)}
      {item(<CityMark importance="support" />, w.town, true)}
      {item(
        <>
          <Relief difficulty="medium" />
          <CityMark importance="support" />
        </>,
        w.medium,
      )}
      {item(
        <>
          <Relief difficulty="hard" />
          <CityMark importance="support" />
        </>,
        w.hard,
      )}
    </div>
  );
}

/**
 * The settlement mark itself: a city is a heavy ring with an ink dot at its
 * heart, a town a small open ring. `fill` is the mastery colour; the capital's
 * double ring is `MapNode`'s, since capital is layout and not rank.
 */
export function CityMark({
  importance,
  fill = color.paper,
  stroke = color.ink,
  dash,
}: {
  importance?: ConceptNode["importance"];
  fill?: string;
  stroke?: string;
  dash?: string;
}) {
  const town = importance === "support";
  return (
    <>
      <circle
        r={town ? 4 : 6}
        fill={fill}
        stroke={stroke}
        strokeWidth={town ? 1.2 : 1.8}
        strokeDasharray={dash}
      />
      {!town && <circle r={1.3} fill={stroke} />}
    </>
  );
}
