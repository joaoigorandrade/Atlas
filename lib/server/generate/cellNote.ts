// ---- The cell's lever on a prompt ------------------------------------------
// `kindNote` says how a kind of concept wants a phase written, `domainNote`
// what counts as evidence. This says how FAR and how GENTLY: the bar the
// node's importance holds it to (`BAR` in `lib/curriculum/cells.ts`), and the
// scaffolding its difficulty needs. Without it every phase is written as if
// every concept were a hard capstone, which is where most of a learner's time
// went.
//
// The default cell — core, medium — returns "" and the unchanged size bands, so
// its prompts are byte-identical to the ones written before the grid existed,
// and `nodeAxes` omits it from the cache key for the same reason.

import { BAR, type Cell, type PhaseId } from "@/lib/curriculum";

/** The cell the key and the prompt treat as "no cell at all". */
export const DEFAULT_CELL: Cell = "12";

const BAR_NOTE = {
  use: "THIS CONCEPT IS A WORKING TOOL for the learner's goal: they must be able to USE it correctly, not master its theory. Spend the words on when to reach for it, how to apply it, and the mistake people make applying it; leave out derivations, proofs and history.",
  recognise:
    "THIS CONCEPT IS PERIPHERAL to the learner's goal: they only need to RECOGNISE it when they meet it — what it is, what it looks like, and how to tell it from its neighbours. Do not derive, prove or drill it. Be brief.",
} as const;

const BLACK_BOX =
  " It is also genuinely hard, and deliberately taught as a BLACK BOX: say what it does and when it comes up, never how it works inside.";

/** The reading teaches; every other phase tests. Difficulty asks different
 *  things of each: more explanation in the one, a gentler climb in the other. */
const DIFFICULTY_NOTE = {
  hard: {
    reading:
      "THIS CONCEPT IS HARD for newcomers — one of the classic stumbling blocks of this topic. Go in smaller steps, make the misconception that trips people up explicit and show exactly why it fails, and work one more example than you otherwise would.",
    practice:
      "THIS CONCEPT IS HARD for newcomers. Make the items climb: the first sits close to what was taught, and only the last asks for the full difficulty — early items scaffold, later ones test.",
  },
  easy: {
    reading:
      "THIS CONCEPT IS EASY once its prerequisites are in place: say it once, clearly, with one example, and stop — no scaffolding it does not need.",
    practice:
      "THIS CONCEPT IS EASY once its prerequisites are in place: write the fewest items the range allows.",
  },
} as const;

/** The prompt note for a node's cell in one phase — "" for the default cell. */
export function cellNote(cell: Cell | undefined, phase: PhaseId): string {
  if (!cell || cell === DEFAULT_CELL) return "";
  const bar = BAR[(["core", "working", "peripheral"] as const)[Number(cell[0]) - 1]];
  const difficulty = (["easy", "medium", "hard"] as const)[Number(cell[1]) - 1];
  const notes: string[] = [];
  if (bar !== "master")
    notes.push(
      BAR_NOTE[bar] + (bar === "recognise" && difficulty === "hard" ? BLACK_BOX : ""),
    );
  // A black box has no inside to scaffold, so its difficulty says nothing more.
  if (difficulty !== "medium" && !(bar === "recognise" && difficulty === "hard"))
    notes.push(DIFFICULTY_NOTE[difficulty][phase === "consume" ? "reading" : "practice"]);
  return notes.length ? `\n${notes.join("\n")}` : "";
}

/**
 * The reading's section band, by cell. Its validator floor is two sections,
 * so a peripheral concept gets two short ones rather than one; a working tool
 * gets at most three; a hard core concept at least three. The default is the
 * band every reading was written to before the grid.
 */
export function consumeBand(cell: Cell | undefined): { min: number; max: number } {
  if (!cell || cell === DEFAULT_CELL) return { min: 2, max: 5 };
  if (cell[0] === "3") return { min: 2, max: 2 };
  if (cell[0] === "2") return { min: 2, max: 3 };
  return cell[1] === "3" ? { min: 3, max: 5 } : { min: 2, max: 3 };
}
