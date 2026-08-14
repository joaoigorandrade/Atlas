import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NodeDetail from "@/components/map/NodeDetail";
import { LanguageProvider } from "@/lib/i18n";
import type { ConceptNode } from "@/lib/curriculum";

// What the detail rail says under a concept's name: the concept's own summary,
// and — only for a node that has none (a run persisted before summaries, or a
// sentence the generation dropped) — the copy about its mastery state.
// `LanguageProvider` is server-rendered here, so its language is the pre-detect
// default, pt-BR.

const base: ConceptNode = {
  id: "ownership",
  label: "Ownership",
  state: "unknown",
  g: 1,
  week: 0,
  x: 0,
  y: 0,
};

const render = (node: ConceptNode) =>
  renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(NodeDetail, {
        visible: true,
        node,
        displayState: "frontier",
        nodes: [node],
        edges: [],
        display: { [node.id]: "frontier" },
        reviewed: false,
        onSelect: () => {},
        onPrimaryAction: () => {},
        onPhaseAction: () => {},
        onSkipKnown: () => {},
      }),
    ),
  );

describe("NodeDetail", () => {
  it("shows what the concept is, not what its state means", () => {
    const html = render({
      ...base,
      summary: "Quem é dono de um valor, e quando ele é descartado.",
    });
    expect(html).toContain("Quem é dono de um valor, e quando ele é descartado.");
    expect(html).not.toContain("Pré-requisitos cumpridos");
  });

  it("falls back to the state line when a node carries no summary", () => {
    expect(render(base)).toContain("Pré-requisitos cumpridos");
  });
});
