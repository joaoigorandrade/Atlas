// Design tokens. The app is drawn as an old atlas: rag paper, iron-gall ink,
// engraved type, and a colourist's washes over it.

// Every token is a [light, dark] pair. The dark half is the iOS app's own
// (`Palette` in ios/.../Core/Theme.swift): the atlas read by lamplight, a warm
// dark built from ink's hue — the two platforms carry the same values.
const PAIRS = {
  // An old sheet: rag paper gone warm with age, and vellum for the plates
  // pasted onto it.
  paper: ["#efe6d2", "#15130f"],
  card: ["#f6efdf", "#1e1b16"],
  cardAlt: ["#f2e9d6", "#232019"],
  chipBg: ["#e7dcc4", "#2a261e"],
  // Iron-gall ink, from the fresh stroke down to the ghost of one.
  ink: ["#2b2118", "#f1ede3"],
  inkSoft: ["#46382a", "#d6d1c5"],
  inkMuted: ["#6a5a47", "#b0aa9c"],
  inkFaint: ["#8c7a63", "#8e887b"],
  inkGhost: ["#ab9b84", "#6f6a60"],
  // Verdigris: the one green an engraver's colourist had to hand.
  accent: ["#3a6a55", "#6fb98e"],
  accentBg: ["#e6eadc", "#1b2a22"],
  // The read-along mark: the accent at a weight that reads as ink on paper
  // rather than as a selection, inside an already-washed paragraph.
  accentWash: ["rgba(58,106,85,0.16)", "rgba(111,185,142,0.22)"],
  /** The label *on* an accent fill — comes back down to ink in the dark. */
  accentInk: ["#f6efdf", "#12180f"],
  /** Vermilion rubrication: drop caps, the marks a scribe put in red. */
  rubric: ["#b03a22", "#e08a6e"],
  /** Gilt: the frontier, the cartouche's ornament. */
  gilt: ["#a8843a", "#d4b26a"],
  /** The engraved rule — double borders on plates and mastheads. */
  rule: ["rgba(43,33,24,0.5)", "rgba(241,237,227,0.4)"],
  amberInk: ["#94602a", "#e0a860"],
  amberBg: ["#f2e4c8", "#2a2116"],
  successBg: ["#e4ead8", "#1a241c"],
  // The failure pair: a desaturated ink over a paper-tinted ground.
  dangerInk: ["#983224", "#e08c7e"],
  dangerBg: ["#f4e2da", "#2c1a16"],
  hairline: ["rgba(43,33,24,0.12)", "rgba(241,237,227,0.14)"],
  hairlineStrong: ["rgba(43,33,24,0.18)", "rgba(241,237,227,0.2)"],
  /** The fill of a control that can't be pressed yet. */
  inkWash: ["rgba(43,33,24,0.07)", "rgba(241,237,227,0.08)"],
  /** What a raised surface casts. Never `ink`, which inverts: a shadow in a
   *  light ink is a glow. Use as `rgba(var(--shade), a)`. */
  shade: ["#2b2118", "#000000"],
  // Mastery (`STATE_COLOR`) and the streak.
  stateUnknown: ["#a99f8c", "#6a655c"],
  stateFrontier: ["#b0852c", "#e3bc5f"],
  stateLearning: ["#3f5f86", "#8aa8e0"],
  stateShaky: ["#a9602e", "#de9a61"],
  stateMastered: ["#4a7552", "#74c08f"],
  stateGap: ["#a8412f", "#e0887a"],
  freeze: ["#6f8fa6", "#9fb8cc"],
  // Each phase's accent (its module's `<PHASE>_COLOR`).
  phaseConnect: ["#7a5a82", "#bfa0d0"],
  phaseExplain: ["#6b6a2e", "#c4c27a"],
  phaseDiscriminate: ["#4a5d70", "#8fafcf"],
  phaseProvenance: ["#7d6243", "#cfaf86"],
  phaseSteelman: ["#4d5b94", "#9fade0"],
  phaseProduce: ["#a45a3a", "#e0a184"],
  phasePredict: ["#5a4f7d", "#a79fd0"],
  phaseTrace: ["#3d6e62", "#74bfa9"],
  phasePerform: ["#4b6b3a", "#74bf96"],
  phaseDrill: ["#8e5a2b", "#d89f63"],
  phaseRecall: ["#56657a", "#9aabc6"],
  phaseCrucible: ["#962c22", "#e08078"],
  // The map's veil over the unreached (see `map.fog`).
  fog: ["rgba(239,230,210,0.66)", "rgba(21,19,15,0.7)"],
} as const satisfies Record<string, readonly [string, string]>;

type Token = keyof typeof PAIRS;
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const cssName = (k: string) => `--at-${kebab(k)}`;

/**
 * Every hex token also declares its bare channels as `--<token>` (no `at-`, so
 * an inline string is no longer than the literal it replaced): `rgba(var(--ink),.07)`.
 *
 * Every colour as a `var()`, so the scheme flips without a re-render. A value
 * that needs an alpha goes through `alpha()`; one that needs the raw value (a
 * baked bitmap, a worker) reads `raw(scheme)`.
 */
export const color = Object.fromEntries(
  Object.keys(PAIRS).map((k) => [k, `var(${cssName(k)})`]),
) as Record<Token, string>;

/** A token at an opacity, `pct` 0–100. Works on a `var()`, unlike `${c}33`. */
export const alpha = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export type Scheme = "light" | "dark";
/** The raw values of one scheme, for what can't resolve a `var()`. */
export const raw = (scheme: Scheme) =>
  Object.fromEntries(
    Object.entries(PAIRS).map(([k, v]) => [k, v[scheme === "light" ? 0 : 1]]),
  ) as Record<Token, string>;

const declare = (scheme: Scheme) =>
  Object.entries(raw(scheme))
    .map(([k, v]) => {
      const hex = /^#([0-9a-f]{6})$/.exec(v)?.[1];
      const rgb =
        hex && [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
      return `${cssName(k)}:${v};` + (rgb ? `--${kebab(k)}:${rgb};` : "");
    })
    .join("");

/** The custom properties for both schemes; `app/layout.tsx` inlines it. */
export const themeCss = `:root{color-scheme:light dark;${declare("light")}}@media (prefers-color-scheme:dark){:root{${declare("dark")}}}`;

/**
 * The map screen's fixed furniture. The top bar, the plan rail and the node
 * detail are absolutely positioned at these sizes, and `centerOn` subtracts
 * them to put a node where the learner can actually see it — a selected node
 * used to open underneath the rail because this was three separate literals.
 */
export const layout = {
  topBar: 58,
  leftRail: 262,
  nodePanel: 356,
  /** Below this the rails collapse to toggles and stop reserving their width. */
  railsMin: 1280,
  /** Below this the map is laid out for a phone: the plan is a full-width
   *  drawer, the node detail a bottom sheet, and the canvas takes touch. */
  phone: 768,
} as const;

/**
 * The map canvas drawn as a map: roads between known concepts, an amber trail
 * into the frontier, fog over the uncharted part, a graticule underneath.
 * Mastery colours stay `STATE_COLOR`; these are the cartography around them.
 */
export const map = {
  road: "rgba(var(--ink),.38)",
  track: "rgba(var(--ink),.16)",
  trail: "var(--at-gilt)",
  gapInk: "var(--at-state-gap)",
  /** Baked into a bitmap, so it can't take a `var()`: read `raw(scheme).fog`. */
  fog: "var(--at-fog)",
  graticule: "rgba(var(--ink),.08)",
  meridian: "rgba(var(--ink),.1)",
  countryInk: "rgba(var(--ink),.62)",
  /** The generated atlas (`atlasTerrain.ts`) paints pixels, so these are RGB,
   *  one set per scheme. */
  atlas: {
    light: {
      paper: [239, 230, 210],
      ink: [52, 40, 29],
      // The colourist's box: rose madder, sap green, gamboge, a Prussian wash,
      // lilac and ochre.
      regions: [
        [214, 150, 146],
        [158, 184, 132],
        [222, 196, 120],
        [148, 170, 196],
        [190, 160, 190],
        [220, 168, 120],
      ],
    },
    // The same box by lamplight: the washes sunk toward the dark ground.
    dark: {
      paper: [21, 19, 15],
      ink: [214, 205, 188],
      regions: [
        [92, 58, 56],
        [62, 80, 52],
        [96, 82, 46],
        [52, 66, 86],
        [78, 62, 80],
        [96, 70, 46],
      ],
    },
  },
} as const;

export const font = {
  /** IM Fell English: titles, cartouches, the engraved voice of the atlas. */
  display: "var(--font-display), 'IM Fell English', Georgia, serif",
  /** IM Fell English SC: kickers and labels, as engraved small capitals. */
  caps: "var(--font-caps), 'IM Fell English SC', Georgia, serif",
  /** EB Garamond: everything that is read. */
  serif: "var(--font-serif), 'EB Garamond', Georgia, serif",
  /** Instrument Sans: only dense controls — search, switches, chips. */
  sans: "var(--font-sans), 'Instrument Sans', system-ui, sans-serif",
  code: "ui-monospace, Menlo, monospace",
  // ponytail: the old mono kicker face is now the engraved caps; every
  // `font.mono` label flips with it. Rename to `caps` at the call sites when
  // they're next touched.
  mono: "var(--font-caps), 'IM Fell English SC', Georgia, serif",
} as const;

/** Figures that line up in a column — timers, counters, percentages. */
export const figures = {
  fontFamily: "var(--font-serif), 'EB Garamond', Georgia, serif",
  fontVariantNumeric: "tabular-nums lining-nums",
} as const;

/** Monospace kicker label style used across every surface. */
export const kicker = (
  size = 11,
  letterSpacing = "0.1em",
  ink: string = color.inkFaint,
) =>
  ({
    fontFamily: font.caps,
    fontSize: size,
    letterSpacing,
    textTransform: "uppercase" as const,
    color: ink,
  }) as const;

/**
 * Motion tokens. Durations in ms; easings named for what they are *for*, not
 * for their curve — pick by intent and the app stays coherent.
 *
 * `enter` is the curve the model view already proved (`modelIn`), promoted to a
 * token. `spring` overshoots and is reserved for reward moments — a concept
 * going green, a streak lighting — never for ordinary UI feedback.
 */
export const motion = {
  duration: {
    /** Press feedback — must land inside the same finger-down. */
    instant: 90,
    /** Hover, colour and border swaps. */
    fast: 150,
    /** The default for anything that moves. */
    base: 240,
    /** Panels, drawers, sheets arriving. */
    slow: 380,
    /** Reward moments, which are allowed to take their time. */
    deliberate: 620,
  },
  ease: {
    standard: "cubic-bezier(.4,0,.2,1)",
    enter: "cubic-bezier(.2,.8,.3,1)",
    exit: "cubic-bezier(.4,0,1,1)",
    spring: "cubic-bezier(.34,1.56,.64,1)",
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEase = keyof typeof motion.ease;

/**
 * Build a `transition` string from the token scale:
 * `transition(["opacity", "transform"], "fast")`.
 *
 * Inline styles are the app's styling seam, so this is how a component reaches
 * the motion tokens — the way `kicker()` is how it reaches the type tokens.
 */
export const transition = (
  props: string | string[],
  duration: MotionDuration = "base",
  ease: MotionEase = "standard",
) =>
  (Array.isArray(props) ? props : [props])
    .map((p) => `${p} ${motion.duration[duration]}ms ${motion.ease[ease]}`)
    .join(", ");
