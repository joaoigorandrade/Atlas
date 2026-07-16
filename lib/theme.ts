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
