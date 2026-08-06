// The JSON shapes the Consume prompts ask for, composed explicitly.
//
// This file exists because the shapes are shared: a section's shape is asked
// for identically by the streaming pass and the single-shot fallback, and a
// beat's shape by the model view's two. It was previously also the home of a
// second, derived section shape — the streaming variant was produced by
// regex-stripping the `"alt"` block out of the full one, and reformatting that
// block made the strip a silent no-op. Nothing is derived here any more; the
// four rewrites that block asked for are generated on demand, one lens at a
// time, as the `model` kind.
//
// `tests/stream.test.ts` pins that every field a validator requires is still
// asked for.

/** Everything a section always has, from its kicker through its Socratic ask. */
export const CONSUME_SECTION_SHAPE = `{
      "kicker": "1 · What it is",                         // segment label: number · 2-4 words
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
      "cite": "a real canonical source (book §, lecture series chapter) — never invent one",
      "diagram": "one-line caption for the figure below, OMIT (with figure) if this section isn't structural",
      "figure": {                                          // OMIT both "diagram" and "figure" entirely when the section is a
                                                            // definition, a comparison, or anything else that isn't a process,
                                                            // hierarchy, or relationship — never invent boxes to fill the slot
        "nodes": [{"id": "a", "label": "≤4 words"}, {"id": "b", "label": "≤4 words"}],   // 2-8 boxes
        "edges": [{"from": "a", "to": "b", "label": "≤3 words, optional"}]               // 1-12 arrows; ids must exist above
      },
      "ask": "a mini-Socratic prompt that answers a likely question with a question"
    }`;

/** One beat of a model view — the unit the four lens controls open. */
export const MODEL_BEAT_SHAPE = `{
      "label": "2-4 words naming this beat",
      "text": "1-3 sentences: the beat itself, concrete and self-contained"
    }`;
