// Design tokens. The app is drawn as an old atlas: rag paper, iron-gall ink,
// engraved type, and a colourist's washes over it.

export const color = {
  // An old sheet: rag paper gone warm with age, and vellum for the plates
  // pasted onto it.
  paper: "#efe6d2",
  card: "#f6efdf",
  cardAlt: "#f2e9d6",
  chipBg: "#e7dcc4",
  // Iron-gall ink, from the fresh stroke down to the ghost of one.
  ink: "#2b2118",
  inkSoft: "#46382a",
  inkMuted: "#6a5a47",
  inkFaint: "#8c7a63",
  inkGhost: "#ab9b84",
  // Verdigris: the one green an engraver's colourist had to hand.
  accent: "#3a6a55",
  accentBg: "#e6eadc",
  // The read-along mark: the accent at a weight that reads as ink on paper
  // rather than as a selection. It sits *inside* an already-washed paragraph
  // (`accentBg`), so it has to be the darker of the two without becoming a
  // second colour.
  accentWash: "rgba(58,106,85,0.16)",
  accentInk: "#f6efdf",
  /** Vermilion rubrication: drop caps, the marks a scribe put in red. */
  rubric: "#b03a22",
  /** Gilt: the frontier, the cartouche's ornament. */
  gilt: "#a8843a",
  /** The engraved rule — double borders on plates and mastheads. */
  rule: "rgba(43,33,24,0.5)",
  amberInk: "#94602a",
  amberBg: "#f2e4c8",
  successBg: "#e4ead8",
  // The failure pair, built the way the amber one is: a desaturated ink at the
  // same lightness over a paper-tinted ground, so an error reads as urgent
  // without leaving the palette. Nothing else in the app is this red.
  dangerInk: "#983224",
  dangerBg: "#f4e2da",
  hairline: "rgba(43,33,24,0.12)",
  hairlineStrong: "rgba(43,33,24,0.18)",
} as const;

/**
 * The few tokens `app/globals.css` needs, as custom properties on `<html>`.
 * Everything else reads the raw values above — the worker, the canvas
 * painters and the `${color}33` alpha suffixes can't take a `var()`.
 */
export const cssVars = {
  "--at-paper": color.paper,
  "--at-card": color.card,
  "--at-ink": color.ink,
  "--at-accent": color.accent,
  "--at-rubric": color.rubric,
  "--at-gilt": color.gilt,
  "--at-rule": color.rule,
} as Record<string, string>;

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
} as const;

/**
 * The map canvas drawn as a map: roads between known concepts, an amber trail
 * into the frontier, fog over the uncharted part, a graticule underneath.
 * Mastery colours stay `STATE_COLOR`; these are the cartography around them.
 */
export const map = {
  road: "rgba(43,33,24,0.38)",
  track: "rgba(43,33,24,0.16)",
  trail: "#a8843a",
  gapInk: "#b2472f",
  fog: "rgba(239,230,210,0.66)",
  graticule: "rgba(43,33,24,0.08)",
  meridian: "rgba(43,33,24,0.1)",
  /** The generated atlas (`atlasTerrain.ts`) paints pixels, so these are RGB. */
  countryInk: "rgba(52,40,29,0.62)",
  atlas: {
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
