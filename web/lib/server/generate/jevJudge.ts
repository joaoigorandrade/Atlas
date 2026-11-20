// What Atlas asks Jev (`lib/server/decide.ts`) about a learner's answer, one
// builder per judge. Each returns a `Decided` (`./judgeStream`) only for what
// Jev is sure of — the LLM is told that ruling and it is pinned over every
// frame — and null otherwise, which leaves the judge exactly as it was.

import { choice, decide, noul, sureChoice, sureNoul } from "../decide";
import type { ChoiceJudgement } from "./choice";
import type { ConnectJudgement } from "./judgeConnect";
import type { FeynmanJudgement } from "./judge";
import type { SocraticJudgement } from "./judgeSocratic";
import type { Decided } from "./judgeStream";

const NONE =
  "None of the candidates: the answer is empty, vague, evasive, off-topic, or says something none of them says.";

// ---- 1. judge mode "choice" -------------------------------------------------

export async function decideChoice(p: {
  topic: string;
  nodeLabel?: string;
  question: string;
  options: string[];
  answer: string;
}): Promise<Decided<ChoiceJudgement> | null> {
  const a = await decide(
    {
      topic: p.topic,
      concept: p.nodeLabel,
      question: p.question,
      learner_answer: p.answer,
    },
    {
      index: choice(
        "Which candidate does the learner's answer actually express — what they SAID, not what they should have said? Match on meaning, not wording: the same quantity in another unit or notation is the same answer; a candidate that only shares their words while meaning something else is not.",
        {
          ...Object.fromEntries(p.options.map((o, i) => [String(i), o])),
          none: NONE,
        },
      ),
    },
    "judge-choice",
  );
  const pick = sureChoice(a?.index);
  if (pick === undefined || pick === "none") return null;
  const index = Number(pick);
  return {
    verdict: { index },
    tell: `"index" is ${index} (candidate: "${p.options[index]}").`,
    early: true,
  };
}

// ---- 3. judge mode "connect" ------------------------------------------------

export async function decideConnect(p: {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
}): Promise<Decided<ConnectJudgement> | null> {
  const a = await decide(
    {
      topic: p.topic,
      link: `${p.nodeLabel} ↔ ${p.question}`,
      reference_relationship: p.reference,
      learner_statement: p.answer,
    },
    {
      verdict: choice(
        "Rule the learner's statement of how the two concepts relate. A true relationship different from the reference is fine. Be strict: it becomes a review card rehearsed for months.",
        {
          true: "States a real, specific relationship between the two, correctly.",
          vague:
            "Nothing in it is wrong, but it says little more than that the two are related.",
          false: "Asserts something wrong about either concept or about how they relate.",
        },
      ),
    },
    "judge-connect",
  );
  const verdict = sureChoice(a?.verdict) as ConnectJudgement["verdict"] | undefined;
  return verdict
    ? { verdict: { verdict }, tell: `"verdict" is "${verdict}".`, early: true }
    : null;
}

// ---- 4 + 6. rubric judges (Feynman, Recall) ---------------------------------

type Row = FeynmanJudgement["verdicts"][number];

/** Per row: Jev's ruling replaces the LLM's; the LLM's quote survives only on
 *  a gap, since a quote is evidence for a gap. */
const pinRows = (llm: Partial<FeynmanJudgement>, v: Partial<FeynmanJudgement>) =>
  llm.verdicts
    ? {
        ...llm,
        verdicts: llm.verdicts.map((r): Row => {
          const fixed = v.verdicts?.find((x) => x.i === r.i);
          if (!fixed || fixed.verdict === r.verdict) return r;
          return {
            i: r.i,
            verdict: fixed.verdict,
            ...(fixed.verdict !== "good" && r.quote ? { quote: r.quote } : null),
          };
        }),
      }
    : llm;

const RUBRIC_WORDING = {
  feynman: {
    ask: (row: string, must: string) =>
      `Does the learner's explanation convey this rubric row in their own words? Row: ${row}. It must convey: ${must}. Paraphrase is fine — this is not a keyword match.`,
    good: "Their own words genuinely convey the row.",
    skipped: "Never addressed, or asserted with no explanation behind it.",
    confused: "Addressed, but with a real error or misconception in it.",
  },
  recall: {
    ask: (row: string, must: string) =>
      `Did the learner's from-memory write-up bring back this rubric row? Row: ${row}. It must bring back: ${must}. A spelling or accent difference in a name is not a miss.`,
    good: "Their own words deliver it.",
    skipped: "It never came back at all.",
    confused: "It came back wrong: what they retrieved is incorrect.",
  },
};

export async function decideRubric(
  mode: keyof typeof RUBRIC_WORDING,
  p: {
    topic: string;
    nodeLabel: string;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    text: string;
  },
): Promise<Decided<FeynmanJudgement> | null> {
  const w = RUBRIC_WORDING[mode];
  const a = await decide(
    { topic: p.topic, concept: p.nodeLabel, learner_text: p.text },
    Object.fromEntries(
      p.rubric.map((r, i) => [
        `row_${i}`,
        choice(w.ask(r.subPoint, r.mustConvey.join("; ")), {
          good: w.good,
          skipped: w.skipped,
          confused: w.confused,
        }),
      ]),
    ),
    `judge-${mode}`,
  );
  const verdicts = p.rubric.flatMap((_, i): Row[] => {
    const v = sureChoice(a?.[`row_${i}`]) as Row["verdict"] | undefined;
    return v ? [{ i, verdict: v }] : [];
  });
  if (!verdicts.length) return null;
  return {
    verdict: { verdicts },
    tell: `these rubric rows are ruled — ${verdicts.map((v) => `row ${v.i}: "${v.verdict}"`).join(", ")}. Rule any other row yourself.`,
    pin: pinRows,
  };
}

// ---- 4. Steelman ------------------------------------------------------------

interface SteelmanShape {
  verdicts: Array<{
    positionId: string;
    verdict: "strong" | "thin" | "strawman";
    quote?: string;
  }>;
  disconfirmer?: "real" | "vacuous";
}

export async function decideSteelman<T extends SteelmanShape>(p: {
  topic: string;
  nodeLabel: string;
  question: string;
  positions: Array<{ id: string; label: string; heldBy: string; mustCover: string[] }>;
  cases: Record<string, string>;
  holds: string;
  disconfirmer: string;
}): Promise<Decided<T> | null> {
  const a = await decide(
    {
      topic: p.topic,
      question: p.question,
      cases: p.positions.map((x) => ({
        position: x.label,
        held_by: x.heldBy,
        a_strong_case_makes: x.mustCover,
        learner_case: p.cases[x.id] ?? "",
      })),
      learner_holds: p.holds,
      what_would_change_their_mind: p.disconfirmer,
    },
    {
      ...Object.fromEntries(
        p.positions.map((x) => [
          `case_${x.id}`,
          choice(
            `Rule the learner's case for the position "${x.label}", by the same standard whichever side they hold.`,
            {
              strong:
                "Makes the load-bearing points; a holder of the position would recognise it as their argument.",
              thin: "Honest, but misses points that carry it.",
              strawman:
                "Built to lose: framed in terms its holders would reject, or markedly weaker than the other case.",
            },
          ),
        ]),
      ),
      disconfirmer: choice("Rule what the learner says would change their mind.", {
        real: "Names evidence or an event that could actually be found or happen and would bear on the question.",
        vacuous:
          "Could never be met, restates the position, or is not about the question.",
      }),
    },
    "judge-steelman",
  );
  const verdicts = p.positions.flatMap((x) => {
    const v = sureChoice(
      a?.[`case_${x.id}`],
    ) as SteelmanShape["verdicts"][number]["verdict"];
    return v ? [{ positionId: x.id, verdict: v }] : [];
  });
  const disconfirmer = sureChoice(a?.disconfirmer) as SteelmanShape["disconfirmer"];
  if (!verdicts.length && !disconfirmer) return null;
  return {
    verdict: { ...(disconfirmer ? { disconfirmer } : null) } as Partial<T>,
    tell: [
      ...verdicts.map((v) => `position ${v.positionId}: "${v.verdict}"`),
      ...(disconfirmer ? [`"disconfirmer": "${disconfirmer}"`] : []),
    ].join(", "),
    pin: (llm) => ({
      ...llm,
      ...(disconfirmer ? { disconfirmer } : null),
      ...(llm.verdicts
        ? {
            verdicts: llm.verdicts.map((r) => {
              const fixed = verdicts.find((v) => v.positionId === r.positionId);
              return fixed ? { ...r, verdict: fixed.verdict } : r;
            }),
          }
        : null),
    }),
  };
}

// ---- 4. Produce -------------------------------------------------------------

export async function decideProduce<T extends { verdict: string }>(p: {
  nodeLabel: string;
  scene: string;
  cue: string;
  targetForms: string[];
  said: string;
  heardIn?: string;
  confidence?: number;
}): Promise<Decided<T> | null> {
  const a = await decide(
    {
      practising: p.nodeLabel,
      situation: p.scene,
      asked_to_get_across: p.cue,
      turn_exists_to_elicit: p.targetForms,
      transcript: p.said,
      ...(p.heardIn ? { recognizer: p.heardIn } : null),
      ...(p.confidence !== undefined ? { weakest_span_confidence: p.confidence } : null),
    },
    {
      verdict: choice(
        "Rule this spoken turn (a speech transcript: ignore punctuation and transcription noise; do not credit a target form in a low-confidence stretch).",
        {
          good: "A listener would understand them AND they used what the turn exists to elicit.",
          thin: "Understood, but they went AROUND the target form — said it another way or simplified past it.",
          wrong:
            "A listener would not follow them, or they reached for the target form and used it incorrectly.",
        },
      ),
    },
    "judge-produce",
  );
  const verdict = sureChoice(a?.verdict);
  return verdict
    ? {
        verdict: { verdict } as Partial<T>,
        tell: `"verdict" is "${verdict}".`,
        early: true,
      }
    : null;
}

// ---- 5 + 7. Socratic: quality, coverage ledger, misconception tag -----------

export async function decideSocratic(p: {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
  sufficient?: string[];
  said?: string[];
  misconceptions?: Array<{ label: string }>;
  recurring?: string[];
}): Promise<Decided<SocraticJudgement> | null> {
  const pieces = p.sufficient ?? [];
  const known = [
    ...new Set([...(p.misconceptions ?? []).map((m) => m.label), ...(p.recurring ?? [])]),
  ];
  const a = await decide(
    {
      topic: p.topic,
      concept: p.nodeLabel,
      tutor_asked: p.question,
      ...(pieces.length ? { the_bar: pieces } : { full_answer: p.reference }),
      learner_said_before: p.said ?? [],
      learner_answer_now: p.answer,
    },
    {
      quality: choice(
        "Classify the UNION of everything the learner has said on this step against the bar.",
        {
          correct: "The union covers the whole bar (wording may differ).",
          partial:
            "Everything said is right and this answer added new ground, but the bar is not fully covered yet.",
          near: "Right direction, but this answer added nothing new or is too imprecise to count.",
          wrong: "Contains a real error or misconception.",
          lost: "Empty, 'I don't know', or entirely off-track.",
        },
      ),
      ...Object.fromEntries(
        pieces.map((x, i) => [
          `covered_${i}`,
          noul(
            `Do the learner's OWN words (now or before) state this piece: "${x}"? Never credit a piece only the tutor's question contained.`,
            "Yes, they stated it.",
            "No.",
          ),
        ]),
      ),
      ...(known.length
        ? {
            misconception: choice(
              "If the learner's answer contains a wrong idea, which one?",
              {
                ...Object.fromEntries(known.map((k, i) => [String(i), k])),
                other: "A different wrong idea, or none at all.",
              },
            ),
          }
        : null),
    },
    "judge-socratic",
  );
  const quality = sureChoice(a?.quality) as SocraticJudgement["quality"] | undefined;
  if (!quality) return null;
  const sure = pieces.map((_, i) => sureNoul(a?.[`covered_${i}`]));
  const ledgerSure = sure.every((v) => v !== undefined);
  const covered = sure.flatMap((v, i) => (v ? [i] : []));
  const tagAt = sureChoice(a?.misconception);
  const misconception =
    (quality === "near" || quality === "wrong") && tagAt && tagAt !== "other"
      ? known[Number(tagAt)]
      : undefined;
  const verdict: Partial<SocraticJudgement> = {
    quality,
    ...(ledgerSure && pieces.length ? { covered } : null),
    ...(misconception ? { misconception } : null),
  };
  return {
    verdict,
    tell: [
      `"quality" is "${quality}"`,
      ...(verdict.covered ? [`"covered" is ${JSON.stringify(covered)}`] : []),
      ...(misconception ? [`"misconception" is "${misconception}" (verbatim)`] : []),
    ].join(", "),
    // "partial" without its ledger is held back by the client (`verdictReady`),
    // so an early frame is only worth sending when the ledger came with it.
    early: !pieces.length || ledgerSure,
  };
}
