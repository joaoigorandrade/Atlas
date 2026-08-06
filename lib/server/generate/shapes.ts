// The JSON shapes the Consume prompts ask for, composed explicitly.
//
// This file exists because the streaming pass and the single-shot pass need
// the *same* section shape minus/plus one block, and the previous approach —
// deriving the streaming variant by regex-stripping `"alt"` out of the full
// template literal — failed silently. Reformatting the `alt` block, or adding
// a field after it, made the regex no-op, and the streaming pass would quietly
// go back to requesting the four rewrites it exists to defer: no type error,
// no test failure, just a section that took twice as long to close.
//
// Composition can't fail that way, and `tests/shapes.test.ts` pins it.

/** The four adaptive-modality rewrites a learner can switch to. */
export const ALT_SHAPE = `{
      "simpler": "the whole section rewritten plainly, still 2-3 paragraphs",
      "example": "a second, different worked example",
      "analogy": "an analogy that maps the structure",
      "deeper": "the sharper, more rigorous version — the part a textbook would put in small print"
    }`;

/** Everything a section always has, from its kicker through its Socratic ask. */
const CONSUME_SECTION_CORE = `      "kicker": "1 · What it is",                         // segment label: number · 2-4 words
      "terms": [{"t": "term", "d": "its pre-taught one-line definition"}],   // 0-3 key terms this section uses, defined before use
      "pred": {                                            // FIRST SECTION ONLY — omit on all others
        "q": "a guess that primes the reading — what do you think happens if…?",
        "opts": [{"label": "...", "correct": false}, {"label": "...", "correct": true}, {"label": "...", "correct": false}],
        "right": "one line confirming the guess and pointing at what follows",
        "wrong": "one honest line naming the misconception, then pointing at what follows"
      },
      "body": ["paragraph 1", "paragraph 2", "paragraph 3"],   // 3-5 paragraphs, 3-6 sentences each
      "example": {                                         // worked inline, part of the material
        "title": "what this example demonstrates",
        "steps": ["step 1 with the actual work shown", "step 2", "..."]   // 2-6 steps
      },
      "takeaway": "the one sentence to carry out of this section",
      "cite": "one real, well-known work a learner could go read next on this — title and author, or a named lecture series. NOT a citation of any sentence above: name only works you are confident exist, and never invent a page, section or chapter number to look precise",
      "diagram": "one-line caption for the figure below, OMIT (with figure) if this section isn't structural",
      "figure": {                                          // OMIT both "diagram" and "figure" entirely when the section is a
                                                            // definition, a comparison, or anything else that isn't a process,
                                                            // hierarchy, or relationship — never invent boxes to fill the slot
        "nodes": [{"id": "a", "label": "≤4 words"}, {"id": "b", "label": "≤4 words"}],   // 2-8 boxes
        "edges": [{"from": "a", "to": "b", "label": "≤3 words, optional"}]               // 1-12 arrows; ids must exist above
      },
      "ask": "a mini-Socratic prompt that answers a likely question with a question",
      "check": {                                           // EVERY SECTION — the comprehension check that closes it
        "q": "a question answerable only by someone who read THIS section — never general knowledge, never guessable from the kicker",
        "opts": [{"label": "...", "correct": false}, {"label": "...", "correct": true}, {"label": "...", "correct": false}],
        "right": "one line confirming what they got right",
        "wrong": "one line naming what they missed and where in the section it was — no new material"
      }`;

/**
 * One Consume section's shape.
 *
 * `withAlt: false` is what the streaming pass asks for, so a section's object
 * closes — and renders — without the model first writing four rewrites of it
 * that nobody may ever tap. The rewrites are generated afterwards, per section,
 * and patched in by index.
 */
export function consumeSectionShape(withAlt: boolean): string {
  return `{
${CONSUME_SECTION_CORE}${withAlt ? `,
      "alt": ${ALT_SHAPE}` : ""}
    }`;
}
