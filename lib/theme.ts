// Design tokens lifted from the Learning Platform design (Learning Platform.dc.html).

export const color = {
  paper: "#f4f1ea",
  card: "#fbf9f4",
  cardAlt: "#f8f5ef",
  chipBg: "#f0ece3",
  ink: "#2c2823",
  inkSoft: "#4a463f",
  inkMuted: "#6b665c",
  inkFaint: "#8a8478",
  inkGhost: "#a8a29a",
  accent: "#2f6b4f",
  accentBg: "#f2f6f2",
  accentInk: "#f7f5ef",
  amberInk: "#a06a30",
  amberBg: "#faf3e6",
  successBg: "#eef4ee",
  // The failure pair, built the way the amber one is: a desaturated ink at the
  // same lightness over a paper-tinted ground, so an error reads as urgent
  // without leaving the palette. Nothing else in the app is this red.
  dangerInk: "#9a4034",
  dangerBg: "#f9edea",
  hairline: "rgba(44,40,35,0.1)",
  hairlineStrong: "rgba(44,40,35,0.14)",
} as const;

export const font = {
  serif: "var(--font-serif), Newsreader, serif",
  sans: "var(--font-sans), 'Instrument Sans', system-ui, sans-serif",
  mono: "var(--font-mono), 'Spline Sans Mono', monospace",
} as const;

/** Monospace kicker label style used across every surface. */
export const kicker = (size = 11, letterSpacing = "0.16em") =>
  ({
    fontFamily: font.mono,
    fontSize: size,
    letterSpacing,
    textTransform: "uppercase" as const,
    color: color.inkFaint,
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
