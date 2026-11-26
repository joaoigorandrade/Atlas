import { describe, expect, it } from "vitest";
import { figureProblems, isWiringProblem, tidyFigure } from "@/lib/server/svgFigure";
import { withSymbols } from "@/lib/server/svgSymbols";

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${body}</svg>`;

// V1 (vertical, + on top) drives R1 across the top; the loop closes along y=340.
const LOOP =
  '<!-- nets: N1=V1.0,R1.0; N2=R1.1,V1.1 -->' +
  '<use id="V1" href="#vsource_v" x="100" y="200"/><use id="R1" href="#resistor" x="200" y="120"/>' +
  '<path d="M100 200V120H200M280 120H340V340H100V280"/>';

describe("figureProblems: labels", () => {
  it("passes a clean, wired, labelled circuit", () => {
    expect(
      figureProblems(
        svg(`${LOOP}<text x="240" y="90" text-anchor="middle">R1 = 4 Ω</text><text x="130" y="250">12 V</text>`),
      ),
    ).toEqual([]);
  });

  it("flags overlapping labels, a label on a symbol or wire, off-canvas text", () => {
    const p = figureProblems(
      svg(
        `${LOOP}<text x="230" y="125">R1</text>` + // on the zigzag
          '<text x="400" y="100">RC = 4.7 kΩ</text><text x="420" y="110">C2</text>' +
          '<text x="790" y="300">Vout</text><text x="200" y="346">x</text>',
      ),
    );
    expect(p).toContain('label "R1" sits on the resistor at (200,120)');
    expect(p).toContain('label "RC = 4.7 kΩ" overlaps label "C2"');
    expect(p).toContain('label "Vout" runs off the canvas');
    expect(p).toContain('label "x" sits on a wire');
    expect(p.filter(isWiringProblem)).toEqual([]); // all cosmetic
  });

  it("uses the rotated box for vertical symbols", () => {
    const near = figureProblems(svg(`${LOOP}<text x="95" y="245">V</text>`));
    expect(near).toContain('label "V" sits on the vsource_v at (100,200)');
    expect(figureProblems(svg(`${LOOP}<text x="130" y="245">V</text>`))).toEqual([]);
  });
});

describe("figureProblems: wiring", () => {
  it("flags unknown symbols and transforms, but not the model's own ids", () => {
    const p = figureProblems(
      svg('<defs><path id="arr" d="M0 0"/></defs><use href="#arr"/><use href="#relay"/><use href="#arrow_up" transform="rotate(90)"/>'),
    );
    expect(p).toEqual([
      "#relay is not a predefined symbol",
      '<use href="#arrow_up"> has a transform; use x/y and an orientation name',
    ]);
  });

  it("flags a floating pin, a loose wire end, a wire through a symbol", () => {
    const p = figureProblems(
      svg(
        '<!-- nets: A=R1.0; B=R1.1; C=C1.0; D=C1.1 -->' +
          '<use id="R1" href="#resistor" x="200" y="200"/><path d="M100 200H200"/>' +
          '<use id="C1" href="#capacitor_v" x="400" y="100"/><path d="M400 60V220"/>',
      ),
    );
    expect(p).toContain("pin 1 of the resistor at (200,200) (280,200) touches no wire");
    expect(p).toContain("a wire end at (100,200) connects to nothing");
    expect(p).toContain("a wire runs through the capacitor_v at (400,100); wires must stop at its pins");
  });

  it("lets open ends finish on a terminal", () => {
    const p = figureProblems(
      svg(
        '<!-- nets: IN=T1.0,R1.0; OUT=R1.1,T2.0 -->' +
          '<use id="T1" href="#terminal" x="100" y="200"/><use id="T2" href="#terminal" x="380" y="200"/>' +
          '<use id="R1" href="#resistor" x="200" y="200"/><path d="M100 200H200M280 200H380"/>',
      ),
    );
    expect(p).toEqual([]);
  });

  it("does not wire-check a figure with no circuit symbols (axes, free lines)", () => {
    expect(figureProblems(svg('<path d="M500 500H560"/><path d="M100 100L140 100L120 130Z"/>'))).toEqual([]);
  });
});

describe("figureProblems: netlist", () => {
  it("demands the nets comment and an id on every pinned symbol", () => {
    const p = figureProblems(svg(LOOP.replace(/<!--.*?-->/, "").replace('id="R1" ', "")));
    expect(p).toEqual(["no nets comment: write <!-- nets: ... --> before drawing"]);
    const q = figureProblems(svg(LOOP.replace('id="R1" ', "")));
    expect(q).toContain("the pin 0 of the resistor at (200,120) has no id");
  });

  it("catches a short that every-pin-touches-a-wire would miss", () => {
    // Same loop plus a wire straight across R1: both pins still touch wires.
    const p = figureProblems(svg(`${LOOP}<path d="M200 120V100H280V120"/>`));
    expect(p).toContain("nets N1 and N2 are shorted together by the drawing");
    expect(p.every(isWiringProblem)).toBe(true);
  });

  it("catches a split net, a missing pin, and a net naming a ghost", () => {
    const p = figureProblems(
      svg(LOOP.replace("N2=R1.1,V1.1", "N2=R1.1,V1.1,Q9.0; N3=").replace("H340V340H100V280", "H340V340H100")),
    );
    expect(p).toContain("net N2 names Q9.0, which is not a placed pin");
    expect(p).toContain("net N2 is drawn split: R1.1, V1.1, Q9.0 are not all wired together");
    const missing = figureProblems(svg(LOOP.replace("N2=R1.1,V1.1", "N2=R1.1")));
    expect(missing).toContain("V1.1 is in no net");
  });

  it("treats every ground symbol as one node, and crossings as unjoined", () => {
    const grounds =
      '<!-- nets: N1=V1.0,R1.0; GND=V1.1,R1.1,G1.0,G2.0 -->' +
      '<use id="V1" href="#vsource_v" x="100" y="200"/><use id="R1" href="#resistor_v" x="300" y="200"/>' +
      '<use id="G1" href="#ground" x="100" y="300"/><use id="G2" href="#ground" x="300" y="300"/>' +
      '<path d="M100 200V160H300V200M100 280V300M300 280V300"/>';
    expect(figureProblems(svg(grounds))).toEqual([]);
    // A wire crossing the N1 wire without ending on it does not join it.
    const crossing = grounds.replace("N1=V1.0,R1.0", "N1=V1.0,R1.0,T1.0") +
      '<use id="T1" href="#terminal" x="200" y="100"/><path d="M200 100V220"/><use id="T2" href="#terminal" x="200" y="220"/>';
    const p = figureProblems(svg(crossing.replace("GND=", "X=T2.0; GND=")));
    expect(p).toContain("net N1 is drawn split: V1.0, R1.0, T1.0 are not all wired together");
  });

  it("rejects an empty drawing, even one with a netlist", () => {
    const p = figureProblems(svg("<!-- nets: N1=R1.0,R1.1 -->"));
    expect(p).toEqual(["the drawing is empty"]);
    expect(p.every(isWiringProblem)).toBe(true);
    expect(figureProblems(svg('<!-- nets: N1=R1.0 --><text x="10" y="30">R1</text>'))).toContain(
      "nets are declared but no circuit symbols are placed",
    );
  });

  it("survives junk path data", () => {
    expect(() => figureProblems(svg('<path d="M0 0Z 5 5 Q"/>'))).not.toThrow();
  });
});

describe("tidyFigure", () => {
  it("moves a label off a symbol, a wire and another label, and only that", () => {
    const crowded = svg(
      `${LOOP}<text x="230" y="125">R1 = 4</text><text x="240" y="90" text-anchor="middle">4 Ω</text><text x="600" y="500">far</text>`,
    );
    expect(figureProblems(crowded).length).toBeGreaterThan(0);
    const tidy = tidyFigure(crowded);
    expect(figureProblems(tidy)).toEqual([]);
    expect(tidy).toContain('<text x="600" y="500">far</text>'); // untouched
    expect(tidy.replace(/<text[^]*$/, "")).toBe(crowded.replace(/<text[^]*$/, "")); // wiring as drawn
  });

  it("never moves a node or pin name, whose place is its meaning", () => {
    const named = svg(`${LOOP}<text x="230" y="125">B</text>`);
    expect(tidyFigure(named)).toBe(named);
  });

  it("grows the viewBox so a label past the edge is not clipped", () => {
    const tidy = tidyFigure(svg(`${LOOP}<text x="-60" y="250">V1 = 24 V</text>`));
    expect(tidy).toMatch(/viewBox="-80 0 880 600"/);
    expect(figureProblems(tidy).filter((p) => p.includes("canvas"))).toEqual([]);
  });
});

describe("withSymbols", () => {
  it("keeps a model's background rect unstroked, but respects its own stroke", () => {
    const out = withSymbols(svg('<rect width="800" height="600" fill="#fff"/><rect x="1" stroke="red"/>'));
    expect(out).toContain('<rect stroke="none" width="800"');
    expect(out).toContain('<rect x="1" stroke="red"/>');
  });

  it("splices the library in and wraps the drawing in the house defaults", () => {
    const out = withSymbols(svg('<use href="#npn" x="0" y="0"/>'));
    expect(out).toMatch(/^<svg[^>]*><defs><g id="resistor"/);
    expect(out).toContain('<g id="npn"');
    expect(out).toContain('<g id="vsource_vr"');
    expect(out).toMatch(/<\/style><g fill="none" stroke="#000"[^>]*><use href="#npn"[^]*<\/g><\/svg>$/);
  });
});
