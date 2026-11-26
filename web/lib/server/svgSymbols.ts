// The symbols an SVG figure's model must not draw itself: a fixed library of
// standard parts, so a resistor or a transistor is always right and costs one
// <use> line instead of a hand-drawn path. The checks on a drawing that uses
// them live in ./svgFigure.ts.
//
// Every symbol is placed with x/y only — no transforms — so the checker always
// knows where it sits. Orientation is picked by name instead of rotated, which
// also keeps +/− and meter letters upright.

export type Box = [number, number, number, number]; // x0 y0 x1 y1
type Mark = { x: number; y: number; t: string }; // "+", "−" or a letter

const ATTRS =
  'fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const BLACK = 'fill="#000" stroke="none"';

const mark = ({ x, y, t }: Mark) =>
  t === "+"
    ? `<path d="M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}"/>`
    : t === "−"
      ? `<path d="M${x - 5} ${y}H${x + 5}"/>`
      : `<text x="${x}" y="${y + 7}" font-size="20" font-family="sans-serif" text-anchor="middle" ${BLACK}>${t}</text>`;

// ---- two-terminal symbols ----------------------------------------------------
// Drawn horizontally with pin0 at (0,0) and pin1 at (80,0); the other three
// orientations are generated below.

const circle = '<circle cx="40" cy="0" r="18"/>';
const leads = (a: number, b: number) => `M0 0H${a}M${b} 0H80`;
const TWO: Record<
  string,
  { inner: string; box: Box; marks?: Mark[]; pin0: string; desc: string }
> = {
  resistor: {
    inner: '<path d="M0 0H20L25 -10L30 10L35 -10L40 10L45 -10L50 10L55 -10L60 0H80"/>',
    box: [20, -12, 60, 12],
    pin0: "",
    desc: "resistor (zigzag)",
  },
  capacitor: {
    inner: '<path d="M0 0H36M36 -16V16M44 -16V16M44 0H80"/>',
    box: [34, -18, 46, 18],
    pin0: "",
    desc: "capacitor",
  },
  inductor: {
    inner:
      '<path d="M0 0H16a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0H80"/>',
    box: [16, -8, 64, 2],
    pin0: "",
    desc: "inductor (coil)",
  },
  lamp: {
    inner: `<circle cx="40" cy="0" r="16"/><path d="${leads(24, 56)}M28.7 -11.3L51.3 11.3M28.7 11.3L51.3 -11.3"/>`,
    box: [22, -18, 58, 18],
    pin0: "",
    desc: "lamp",
  },
  switch: {
    inner: `<path d="${leads(24, 56)}M26 -1L54 -18"/><circle cx="24" cy="0" r="3"/><circle cx="56" cy="0" r="3"/>`,
    box: [20, -20, 60, 4],
    pin0: "",
    desc: "open switch",
  },
  battery: {
    inner: '<path d="M0 0H36M36 -18V18M44 -9V9M44 0H80"/>',
    box: [34, -20, 46, 20],
    marks: [{ x: 26, y: -16, t: "+" }],
    pin0: "pin0 is +",
    desc: "battery / DC cell",
  },
  vsource: {
    inner: `${circle}<path d="${leads(22, 58)}"/>`,
    box: [20, -20, 60, 20],
    marks: [
      { x: 31, y: 0, t: "+" },
      { x: 49, y: 0, t: "−" },
    ],
    pin0: "pin0 is +",
    desc: "independent voltage source (circle, + and −)",
  },
  acsource: {
    inner: `${circle}<path d="${leads(22, 58)}M28 0q6 -12 12 0t12 0"/>`,
    box: [20, -20, 60, 20],
    pin0: "",
    desc: "AC voltage source (circle with sine)",
  },
  isource: {
    inner: `${circle}<path d="${leads(22, 58)}M28 0H52M45 -6L52 0L45 6"/>`,
    box: [20, -20, 60, 20],
    pin0: "arrow points from pin0 to pin1",
    desc: "independent current source (circle with arrow)",
  },
  depvsource: {
    inner: `<path d="${leads(22, 58)}M22 0L40 -18L58 0L40 18Z"/>`,
    box: [20, -20, 60, 20],
    marks: [
      { x: 33, y: 0, t: "+" },
      { x: 47, y: 0, t: "−" },
    ],
    pin0: "pin0 is +",
    desc: "dependent voltage source (diamond, + and −)",
  },
  depisource: {
    inner: `<path d="${leads(22, 58)}M22 0L40 -18L58 0L40 18ZM30 0H50M44 -5L50 0L44 5"/>`,
    box: [20, -20, 60, 20],
    pin0: "arrow points from pin0 to pin1",
    desc: "dependent current source (diamond with arrow)",
  },
  diode: {
    inner: `<path d="M0 0H30M50 -14V14M50 0H80"/><path d="M30 -14L50 0L30 14Z" ${BLACK}/>`,
    box: [30, -14, 50, 14],
    pin0: "pin0 is the anode",
    desc: "diode",
  },
  zener: {
    inner: `<path d="M0 0H30M44 -18L50 -14V14L56 18M50 0H80"/><path d="M30 -14L50 0L30 14Z" ${BLACK}/>`,
    box: [30, -18, 56, 18],
    pin0: "pin0 is the anode (a reverse-biased zener has its cathode, pin1, at the higher voltage)",
    desc: "zener diode",
  },
  motor: {
    inner: `${circle}<path d="${leads(22, 58)}"/>`,
    box: [20, -20, 60, 20],
    marks: [{ x: 40, y: 0, t: "M" }],
    pin0: "",
    desc: "DC motor",
  },
  ammeter: {
    inner: `${circle}<path d="${leads(22, 58)}"/>`,
    box: [20, -20, 60, 20],
    marks: [{ x: 40, y: 0, t: "A" }],
    pin0: "",
    desc: "ammeter",
  },
  voltmeter: {
    inner: `${circle}<path d="${leads(22, 58)}"/>`,
    box: [20, -20, 60, 20],
    marks: [{ x: 40, y: 0, t: "V" }],
    pin0: "",
    desc: "voltmeter",
  },
  galvanometer: {
    inner: `${circle}<path d="${leads(22, 58)}"/>`,
    box: [20, -20, 60, 20],
    marks: [{ x: 40, y: 0, t: "G" }],
    pin0: "",
    desc: "galvanometer",
  },
};

/** The four orientations: lines turn, marks only move (so they stay upright). */
const ORIENT: Record<
  string,
  { g: string; pt: (x: number, y: number) => [number, number] }
> = {
  "": { g: "", pt: (x, y) => [x, y] },
  _r: { g: "translate(80,0) rotate(180)", pt: (x, y) => [80 - x, -y] },
  _v: { g: "rotate(90)", pt: (x, y) => [-y, x] },
  _vr: { g: "translate(0,80) rotate(-90)", pt: (x, y) => [y, 80 - x] },
};

const turnBox = (b: Box, pt: (x: number, y: number) => [number, number]): Box => {
  const [ax, ay] = pt(b[0], b[1]);
  const [bx, by] = pt(b[2], b[3]);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
};

// ---- multi-pin symbols (one orientation each) --------------------------------

const MULTI: Record<string, { inner: string; box: Box | null; marks?: Mark[]; desc: string }> = {
  ground: {
    inner: '<path d="M0 0V12M-16 12H16M-10 18H10M-4 24H4"/>',
    box: [-16, 4, 16, 24],
    desc: "ground: pin (0,0) at the top",
  },
  terminal: {
    inner: '<circle r="5" fill="#fff"/>',
    box: null,
    desc: "open terminal (small circle) with its one pin at (x,y): every wire end that is not on a component (Vin, Vout, a, b…) ends on one, labelled beside it",
  },
  dot: {
    inner: `<circle r="4" ${BLACK}/>`,
    box: null,
    desc: "junction dot centred on (0,0)",
  },
  npn: {
    inner: `<circle cx="28" cy="0" r="26"/><path d="M0 0H20M20 -18V18M20 -8L40 -24V-40M20 8L40 24V40"/><path d="M34 19.2L25.3 17.3L30.3 11.1Z" ${BLACK}/>`,
    box: [2, -26, 54, 26],
    desc: "NPN transistor: base (0,0), collector (40,-40), emitter (40,40)",
  },
  pnp: {
    inner: `<circle cx="28" cy="0" r="26"/><path d="M0 0H20M20 -18V18M20 -8L40 -24V-40M20 8L40 24V40"/><path d="M23.9 -11.1L32.6 -13L27.6 -19.2Z" ${BLACK}/>`,
    box: [2, -26, 54, 26],
    desc: "PNP transistor: base (0,0), emitter (40,-40), collector (40,40)",
  },
  nmos: {
    inner: `<path d="M0 0H16M16 -16V16M22 -20V-10M22 -5V5M22 10V20M22 -15H40V-40M22 15H40V40M22 0H40V15"/><path d="M24 0L32 -4V4Z" ${BLACK}/>`,
    box: [14, -22, 42, 22],
    desc: "N-channel MOSFET: gate (0,0), drain (40,-40), source (40,40)",
  },
  pmos: {
    inner: `<path d="M0 0H16M16 -16V16M22 -20V-10M22 -5V5M22 10V20M22 -15H40V-40M22 15H40V40M22 0H40V-15"/><path d="M38 0L30 -4V4Z" ${BLACK}/>`,
    box: [14, -22, 42, 22],
    desc: "P-channel MOSFET: gate (0,0), source (40,-40), drain (40,40)",
  },
  arrow_right: {
    inner: `<path d="M-20 0H12"/><path d="M20 0L10 -5V5Z" ${BLACK}/>`,
    box: null,
    desc: "current/direction arrow 40px long centred on (x,y), pointing right; also arrow_left, arrow_up, arrow_down",
  },
  arrow_left: {
    inner: `<path d="M20 0H-12"/><path d="M-20 0L-10 -5V5Z" ${BLACK}/>`,
    box: null,
    desc: "",
  },
  arrow_up: {
    inner: `<path d="M0 20V-12"/><path d="M0 -20L-5 -10H5Z" ${BLACK}/>`,
    box: null,
    desc: "",
  },
  arrow_down: {
    inner: `<path d="M0 -20V12"/><path d="M0 20L-5 10H5Z" ${BLACK}/>`,
    box: null,
    desc: "",
  },
  opamp: {
    inner: '<path d="M20 -50V50L100 0ZM0 -20H20M0 20H20"/>',
    box: [20, -50, 100, 50],
    marks: [
      { x: 30, y: -20, t: "−" },
      { x: 30, y: 20, t: "+" },
    ],
    desc: "op-amp: inverting − input (0,-20), non-inverting + input (0,20), output (100,0)",
  },
  opamp_p: {
    inner: '<path d="M20 -50V50L100 0ZM0 -20H20M0 20H20"/>',
    box: [20, -50, 100, 50],
    marks: [
      { x: 30, y: -20, t: "+" },
      { x: 30, y: 20, t: "−" },
    ],
    desc: "op-amp with + on top: + input (0,-20), − input (0,20), output (100,0)",
  },
  loop_cw: {
    inner: `<path d="M-6.2 -23.2A24 24 0 1 1 -23.2 -6.2"/><path d="M-6.2 -23.2l-9 -3 3 9Z" ${BLACK}/>`,
    box: [-26, -26, 26, 26],
    desc: "clockwise mesh-current arrow, a 24px-radius loop centred on (x,y); put its label (I1…) just beside it, never on it",
  },
  loop_ccw: {
    inner: `<path d="M6.2 -23.2A24 24 0 1 0 23.2 -6.2"/><path d="M6.2 -23.2l9 -3 -3 9Z" ${BLACK}/>`,
    box: [-26, -26, 26, 26],
    desc: "counter-clockwise mesh-current arrow, same as loop_cw",
  },
  transformer: {
    inner:
      '<path d="M0 -40V-24a6 6 0 0 1 0 12a6 6 0 0 1 0 12a6 6 0 0 1 0 12a6 6 0 0 1 0 12V40M60 -40V-24a6 6 0 0 0 0 12a6 6 0 0 0 0 12a6 6 0 0 0 0 12a6 6 0 0 0 0 12V40M26 -30V30M34 -30V30"/>',
    box: [0, -30, 60, 30],
    desc: "transformer: primary pins (0,-40) and (0,40), secondary pins (60,-40) and (60,40)",
  },
};

// ---- the library -------------------------------------------------------------

export type Pt = [number, number];
const PINS_H: Pt[] = [[0, 0], [80, 0]];
const PINS_V: Pt[] = [[0, 0], [0, 80]];
const MULTI_PINS: Record<string, Pt[]> = {
  ground: [[0, 0]],
  dot: [],
  terminal: [[0, 0]],
  loop_cw: [],
  loop_ccw: [],
  npn: [[0, 0], [40, -40], [40, 40]],
  pnp: [[0, 0], [40, -40], [40, 40]],
  nmos: [[0, 0], [40, -40], [40, 40]],
  pmos: [[0, 0], [40, -40], [40, 40]],
  arrow_right: [],
  arrow_left: [],
  arrow_up: [],
  arrow_down: [],
  opamp: [[0, -20], [0, 20], [100, 0]],
  opamp_p: [[0, -20], [0, 20], [100, 0]],
  transformer: [[0, -40], [0, 40], [60, -40], [60, 40]],
};

export const SYMBOLS: Record<string, { svg: string; box: Box | null; pins: Pt[] }> = {};
for (const [name, s] of Object.entries(TWO))
  for (const [suffix, o] of Object.entries(ORIENT)) {
    const lines = o.g ? `<g transform="${o.g}">${s.inner}</g>` : s.inner;
    const marks = (s.marks ?? []).map((m) => {
      const [x, y] = o.pt(m.x, m.y);
      return mark({ x, y, t: m.t });
    });
    SYMBOLS[name + suffix] = {
      svg: lines + marks.join(""),
      box: turnBox(s.box, o.pt),
      pins: suffix.startsWith("_v") ? PINS_V : PINS_H,
    };
  }
for (const [name, s] of Object.entries(MULTI))
  SYMBOLS[name] = {
    svg: s.inner + (s.marks ?? []).map(mark).join(""),
    box: s.box,
    pins: MULTI_PINS[name],
  };

const DEFS = `<defs>${Object.entries(SYMBOLS)
  .map(([id, s]) => `<g id="${id}" ${ATTRS}>${s.svg}</g>`)
  .join("")}</defs>`;

/** What the model is told about the library, appended to its system prompt. */
export const SYMBOL_GUIDE = [
  'Standard symbols are PREDEFINED — never draw them, never write <defs> for them. Place one with <use href="#NAME" x="X" y="Y"/> (x/y only, NO transform), X and Y multiples of 20.',
  "Two-terminal symbols, each in four orientations: NAME has pin0 at (x,y) and pin1 at (x+80,y); NAME_r the same pins with pin0 on the right at (x+80,y); NAME_v has pin0 at (x,y) and pin1 at (x,y+80); NAME_vr the same pins with pin0 at the bottom (x,y+80). Names:",
  ...Object.entries(TWO).map(([n, s]) => `- ${n}: ${s.desc}${s.pin0 ? `; ${s.pin0}` : ""}`),
  "Other symbols (pins relative to x,y; one orientation):",
  ...Object.entries(MULTI)
    .filter(([, s]) => s.desc)
    .map(([n, s]) => `- ${n}: ${s.desc}`),
  "Pins are numbered from 0 in the order listed (a two-terminal symbol: pin0, pin1; npn: 0 base, 1 collector, 2 emitter; opamp: 0 −, 1 +, 2 output; transformer: 0..3 as listed).",
  'Wires: <path d="..." fill="none" stroke="#000" stroke-width="2.5"/> using only M, H and V commands, every coordinate a multiple of 20; each wire ends exactly on a symbol pin or on another wire. Wires that only cross do NOT connect; where wires join, one must END on the other, with a dot. Your own paths are wires ONLY: every component, terminal, arrow and loop comes from the list above.',
  'In a circuit: give every placed symbol except dots, arrows and loops a unique id (id="R1", "V1", "Q1", "GND1", "T1"…), and BEFORE drawing write the netlist as the first thing inside <svg>, one net per electrical node, every pin of every symbol in exactly one net, all grounds in one net: <!-- nets: N1=V1.0,R1.0; N2=R1.1,R2.0,Q1.0; GND=V1.1,R2.1,GND1.0 -->. Then draw exactly that netlist.',
  "Arrows (current, force, direction) must point exactly as the text says — a current INTO a node points toward it. Check every arrow against the text before replying.",
  "If the figure needs ANY component that is not in the list above (a MOSFET variant, a logic gate, a 555, a relay…), do not improvise one: reply with the single word NONE.",
  'Labels: <text x y font-size="22" font-family="sans-serif" fill="#000"> with no transform, beside — never on — the symbol or wire it names, and well clear of every other label. A horizontal symbol at (x,y): its label at y-30 (above) with text-anchor="middle" at x+40. A vertical symbol at (x,y): its label at x+30 with text-anchor="start" (or x-30 with text-anchor="end") and y+46. One label per symbol: name and value together ("R1 = 4 Ω"), never a letter the symbol already shows.',
].join("\n");

// ---- assembly ----------------------------------------------------------------

/** The model's drawing is wrapped in the house defaults, so a path it left
 *  without stroke/fill still renders as a black wire (SVG's own default is an
 *  invisible, black-FILLED shape). Its own attributes still win. */
export const withSymbols = (svg: string): string =>
  svg
    .replace(
      /<svg\b[^>]*>/i,
      (open) =>
        `${open}${DEFS}<style>text{fill:#000;stroke:none;font-family:sans-serif}</style><g ${ATTRS}>`,
    )
    .replace(/<\/svg>\s*$/i, "</g></svg>")
    // A background or box the model drew must not pick up the wire stroke.
    .replace(/<rect\b(?![^>]*\sstroke\s*=)/gi, '<rect stroke="none"');
