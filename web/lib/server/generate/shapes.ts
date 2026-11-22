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

/**
 * Everything a section always has, in the order the model should WRITE it —
 * which is not the order the learner reads it.
 *
 * The takeaway comes first on purpose: it is the section's one idea, decided
 * before the prose that teaches it, and it is also all a learner sees when they
 * answer the check right before reading (the section collapses to it). Writing
 * it last made it a summary of whatever the prose happened to cover. Field
 * order on the wire is free: the validator builds the section explicitly, and
 * a streamed draft is assembled by `draftConsumeSection`, never read off this.
 *
 * The comments carry counts and limits only. The rules for each field live
 * once, in the prompt (`consumeContext`), rather than half here and half there.
 */
export const CONSUME_SECTION_SHAPE = `{
      "kicker": "1 · What it is",                        // number · 2-4 words naming this section's job
      "takeaway": "…",                                   // written FIRST; one precise sentence
      "terms": [{"t": "…", "d": "…"}],                   // 0-3
      "body": ["…", "…"],                                // 2-5 paragraphs, 3-6 sentences each
      "example": {
        "title": "…",
        "steps": ["**Label:** the actual work", "…"]     // 2-6 steps, each led by its bold purpose label
      },
      "diagram": "…",                                    // a one-line caption; OMIT together with "figure"
      "figure": {
        "nodes": [{"id": "a", "label": "≤4 words"}, {"id": "b", "label": "≤4 words"}],   // 2-8
        "edges": [{"from": "a", "to": "b", "label": "≤3 words, optional"}]               // 1-12; ids from nodes
      },
      "ask": "…",
      "check": {
        "q": "…",
        "opts": [{"label": "…", "correct": false}, {"label": "…", "correct": true}, {"label": "…", "correct": false}],
        "right": "…",
        "wrong": "…"
      },
      "cite": "Title — Author"                           // OPTIONAL: omit unless you are certain the work exists
    }`;

/**
 * Pieces of a filled-in section, on a deliberately unrelated everyday concept.
 *
 * The rules describe a takeaway, a labelled step and a stand-alone check; they
 * cannot show the register. Only the three hardest fields are shown, so the
 * example costs little and has no body to imitate. Off-topic on purpose, like
 * every example here: copying its content would be obviously wrong.
 */
export const CONSUME_SECTION_EXAMPLE = `Three fields of a filled-in section, from an unrelated concept (reading a 24-hour clock), to show the precision expected — copy their FORM, never their content:
  "takeaway": "On a 24-hour clock, an hour from 13 to 23 is afternoon or evening: subtract 12 from it to get the familiar time, and keep the minutes as they are."
  "steps": ["**Read the hour:** in 17:40 the hour is 17, which is past 12, so this is after noon.", "**Subtract 12:** 17 − 12 = 5, so the hour is 5.", "**Keep the minutes:** 40 stays 40, giving 5:40 in the afternoon."]
  "check": {"q": "A train leaves at 19:15 on a 24-hour clock. What time is that on a 12-hour clock?", "opts": [{"label": "7:15 in the evening", "correct": true}, {"label": "9:15 in the evening", "correct": false}, {"label": "7:15 in the morning", "correct": false}], "right": "Yes — 19 is past 12, and 19 − 12 = 7, so it is 7:15 pm.", "wrong": "Subtracting 12 from 19 gives 7, not 9, and any hour past 12 is after noon — the second step settles it."}`;

/** One beat of a model view — the unit the four lens controls open. */
export const MODEL_BEAT_SHAPE = `{
      "label": "2-4 words naming this beat",
      "text": "1-3 sentences: the beat itself, concrete and self-contained"
    }`;

/**
 * A filled-in beat, on a deliberately unrelated everyday concept.
 *
 * The schema comments above describe the fields; they cannot demonstrate the
 * register. Without a worked example the model returns the description as the
 * value ("2-4 words naming this beat"), which is exactly what `rejectEcho`
 * spends its time catching. The example is off-topic on purpose: it teaches
 * form, and copying its content would be obviously wrong.
 */
export const MODEL_BEAT_EXAMPLE = `Here is one filled-in beat, from an unrelated concept, to show the level of concreteness expected — copy its FORM, never its content:
{
      "label": "Gears trade speed",
      "text": "A low gear turns the wheel less per pedal stroke, so the same leg force moves you a shorter distance. You buy that easier stroke by pedalling more times to cover the same ground."
    }`;
