// ---- kind: connect ---------------------------------------------------------
import { arr, fail, interestNote, languageNote, obj, oneOf, str, user } from "./common";
import { ElaborationContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

/** The concept-web slots (560×440 canvas) the demo design places candidates in. */
const CONNECT_SLOTS: ReadonlyArray<[number, number]> = [
  [104, 66],
  [408, 92],
  [472, 314],
  [250, 404],
  [64, 300],
];

function validateConnect(
  nodeId: string,
  nodeLabel: string,
  pool: Array<{ id: string; label: string }>,
) {
  return (raw: unknown): ElaborationContent => {
    const root = obj(raw, "payload");
    const encoding = oneOf(
      root.encoding,
      ["conceptual", "list-like"] as const,
      "encoding",
    );
    const byId = new Map(pool.map((p) => [p.id, p.label]));
    const seen = new Set<string>();
    const cands = arr(root.cands, "cands", Math.min(2, pool.length), CONNECT_SLOTS.length)
      .map((v, i) => {
        const c = obj(v, `cands[${i}]`);
        const id = str(c.id, `cands[${i}].id`)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-");
        if (!byId.has(id) || seen.has(id)) return null;
        seen.add(id);
        const [x, y] = CONNECT_SLOTS[seen.size - 1];
        return {
          id,
          label: byId.get(id)!,
          x,
          y,
          rel: str(c.rel, `cands[${i}].rel`),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (cands.length < Math.min(2, pool.length))
      fail(
        `cands must include at least ${Math.min(2, pool.length)} ids from the provided list`,
      );
    const base: ElaborationContent = {
      centerId: nodeId,
      centerLabel: nodeLabel,
      encoding,
      detectNote: str(root.detectNote, "detectNote"),
      center: { x: 290, y: 210 },
      cands,
    };
    if (encoding === "list-like") {
      // The cap is generous on purpose: "vocab" is a named list-like case, and
      // a twenty-noun set used to fail validation twice and throw the learner
      // an error instead of a phase.
      base.items = arr(root.items, "items (required for list-like)", 3, 30).map((s, i) =>
        str(s, `items[${i}]`),
      );
      base.mnemonics = arr(
        root.mnemonics,
        "mnemonics (required for list-like)",
        1,
        3,
      ).map((v, i) => {
        const m = obj(v, `mnemonics[${i}]`);
        return {
          kind: str(m.kind, `mnemonics[${i}].kind`),
          title: str(m.title, `mnemonics[${i}].title`),
          body: str(m.body, `mnemonics[${i}].body`),
        };
      });
    }
    return base;
  };
}

export async function generateConnect(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  pool: Array<{ id: string; label: string }>;
  interests: string;
  language?: Language;
}): Promise<ElaborationContent> {
  const { topic, nodeId, nodeLabel, pool, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write the Connect (elaboration) pass for the concept "${nodeLabel}" within "${topic}".
The learner wires the new concept into concepts they already own. Their prior concepts (id: label):
${pool.map((p) => `- ${p.id}: ${p.label}`).join("\n")}
${interestNote(interests)}

First auto-detect the encoding. Apply this test: could a learner be fairly asked to reproduce a fixed set or ordered sequence from memory — named stages, a closed taxonomy, an algorithm's steps, vocabulary? Then it is "list-like", even when the material also carries deep ideas (the stages of mitosis, the HTTP status classes, the cranial nerves, an elimination procedure are all list-like). Use "conceptual" when there is nothing enumerable to hold in order and a mnemonic would be noise.

Return JSON:
{
  "encoding": "conceptual" | "list-like",
  "detectNote": "one-sentence plain-language rationale for the choice, first person ('I'm using elaboration — wiring, not memorizing')",
  "cands": [   // the 2-5 prior concepts with a GENUINELY specific relationship to this one — a vague "both are about X" link is worse than leaving it out
    {"id": "an id from the list", "rel": "the true relationship, one sentence, specific to both concepts — a draft the learner can accept or rewrite"}
  ],
  "items": ["step 1", ...],          // list-like only: 3-30 ordered items a mnemonic organizes
  "mnemonics": [                       // list-like only: 1-2 offered aids — a second ONLY when it is a genuinely different KIND of aid, not a second acronym
    {"kind": "Acronym" | "Method of loci" | "Vivid image", "title": "short title", "body": "the aid itself, editable"}
  ]
}${languageNote(language)}`,
    ),
    validateConnect(nodeId, nodeLabel, pool),
    { label: "connect" },
  );
}
