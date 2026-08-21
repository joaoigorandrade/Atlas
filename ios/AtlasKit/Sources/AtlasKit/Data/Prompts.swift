import Foundation

/// The prompts, copied from `lib/server/generate/*.ts` rather than rewritten.
///
/// Copied is the point: the prompt IS the content quality, and a paraphrase
/// drifts silently — the app would start teaching slightly differently from the
/// web and nothing would fail. When a prompt changes on the server it has to be
/// re-copied here, which is the cost of generating on the device. `Kind.ported`
/// below is the list of what has been; everything else still goes to
/// `/api/generate`, where there is only one copy.
///
/// ponytail: no template engine and no prompt DSL — string interpolation, the
/// same as the TypeScript it came from, so the two can be diffed by eye.
enum Prompts {
    // MARK: - The pieces every prompt shares (lib/server/generate/common.ts)

    static let system = OpenRouter.Message(
        role: "system",
        content: "You are the content engine of Atlas, a mastery-learning platform built on a living concept map. "
            + "You produce rigorous, honest pedagogy: precise definitions, desirable difficulties, anti-sycophancy "
            + "(wrong reasoning is caught and named, never smoothed over). "
            + "Reply with ONLY one valid JSON object — no markdown fences, no prose before or after."
    )

    static func user(_ content: String) -> [OpenRouter.Message] {
        [system, OpenRouter.Message(role: "user", content: content)]
    }

    /// Field NAMES stay English (the app parses fixed keys) — only the values
    /// the model writes switch language.
    static func languageNote(_ language: String) -> String {
        language == "pt-BR"
            ? "\n\nOUTPUT LANGUAGE: Brazilian Portuguese (pt-BR). Every natural-language string value you return must be written in Portuguese — including any label, tag, title or example text shown in the JSON template above. Translate those; never copy their English wording. Keep only JSON field names and enum values (e.g. \"correct\", \"mastered\", \"conceptual\", \"list-like\") exactly as specified in English."
            : ""
    }

    /// A count reads as a quota, so every sized prompt asks for a range and
    /// says what each end means.
    static func sizeRule(unit: String, min: Int, max: Int, atMin: String, atMax: String) -> String {
        "SIZE — read it off the material, never off a quota: write \(min)-\(max) \(unit). \(min) is the right answer for \(atMin); only \(atMax) earns \(max). Add one only when it carries something none of the others do. Covering the material in \(min) and stopping is a correct answer, not a shortfall — padding to reach \(max) makes this worse, not more thorough."
    }

    static func interestNote(_ interests: String) -> String {
        let trimmed = interests.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            ? "Use concrete, everyday analogies when they genuinely fit."
            : "Where an analogy helps, draw it from the learner's stated interests (\(trimmed)) — but only when it genuinely fits."
    }

    /// What the other passes already taught and what they are going to. Without
    /// it each pass is written as if its concept were the only one on the map.
    static func boundaryNote(prior: [String], later: [String]) -> String {
        let prior = prior.filter { !$0.isEmpty }
        let later = later.filter { !$0.isEmpty }
        guard !prior.isEmpty || !later.isEmpty else { return "" }
        var lines = [
            "",
            "THE MAP AROUND THIS CONCEPT — the learner is working through a whole map, and every other concept on it has its own pass. Stay inside this one:",
        ]
        if !prior.isEmpty {
            lines.append("- Already taught, earlier on the map: \(prior.joined(separator: ", ")). Assume all of it and build on it — refer to it by name, never re-explain or re-derive it. A recap of one of those is material the learner has already read.")
        }
        if !later.isEmpty {
            lines.append("- Taught later, by their OWN pass: \(later.joined(separator: ", ")). These are not yours. Do not explain, define, derive or work an example of any of them; at most name one in a single clause to say where this leads (\"which is what X builds on\"). Anything you teach here the learner meets again as a repeat.")
        }
        lines.append("- Anything the concept genuinely needs that appears in NEITHER list is yours to teach, in as much depth as it earns.")
        return lines.joined(separator: "\n") + "\n"
    }

    // MARK: - The shapes (lib/server/generate/shapes.ts)

    static let consumeSectionShape = """
    {
          "kicker": "1 · What it is",                         // segment label: number · 2-4 words
          "terms": [{"t": "term", "d": "its pre-taught one-line definition"}],   // 0-3 key terms this section uses, defined before use
          "body": ["paragraph 1", "paragraph 2", "paragraph 3"],   // 2-5 paragraphs of 3-6 sentences — as many as the idea needs, never padding
          "example": {                                         // worked inline, part of the material
            "title": "what this example demonstrates",
            "steps": ["step 1 with the actual work shown", "step 2", "..."]   // 2-6 steps
          },
          "takeaway": "the one sentence to carry out of this section",
          "cite": "one real, well-known work a learner could go read next on this — title and author, or a named lecture series. NOT a citation of any sentence above: name only works you are confident exist, and never invent a page, section or chapter number to look precise. OMIT the field if no work you are sure of fits",
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
          }
        }
    """

    static let socraticStepShape = """
    {
          "spare": false,   // true only on the held-back extra probes, which come last
          "move": "Clarify" | "Challenge the assumption" | "Probe the reasoning" | "Probe the implications",   // core probes: each move once, in this order; a spare reuses whichever fits
          "prompt": "the probing question the tutor opens with",
          "replies": [    // 3 plausible learner replies; exactly one "correct"; one is the misconception a real learner actually holds, written out in their voice
            {"label": "the learner's reply, in their own words", "quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's honest, specific reaction"}
          ],
          "hint": "an 'I'm stuck' nudge that reframes without giving it away",
          "tell": "the direct instruction for 'Just tell me' — complete and precise"
        }
    """

    /// The schema names the fields; only an example shows that `label` is a
    /// sentence a learner would actually say rather than a description of one.
    static let socraticStepExample = """
    Here is one filled-in step, from an unrelated concept, to show the expected concreteness — copy its FORM, never its content:
    {
          "spare": false,
          "move": "Challenge the assumption",
          "prompt": "You said a low gear makes the bike easier to pedal. Easier in what sense — are you doing less work overall to get up the hill?",
          "replies": [
            {"label": "No, the total work is about the same, I just spread it over more pedal strokes.", "quality": "correct", "response": "Exactly — you traded force per stroke for number of strokes. The hill still costs what it costs."},
            {"label": "Yes, low gear means less effort to climb the hill.", "quality": "wrong", "response": "That would be a free lunch. You feel less force in each stroke, but you pedal many more times — add those up and the hill charges you the same."},
            {"label": "I think it's easier but I couldn't say why.", "quality": "near", "response": "You've got the feel right. Hold onto 'easier per stroke' and ask what has to grow in exchange."}
          ],
          "hint": "Count the pedal strokes it takes to reach the top in each gear, not how hard any one of them feels.",
          "tell": "A low gear reduces the force per pedal stroke but increases how many strokes the climb takes. The work against gravity is fixed by your weight and the height, so the gear only changes how that cost is packaged."
        }
    """

    // MARK: - The kinds that run on the device

    /// What the session screens already put in their context dictionary, read
    /// back with names instead of subscripts.
    struct Context {
        let topic: String, nodeLabel: String, interests: String, language: String
        let prereqLabels: [String], priorLabels: [String], laterLabels: [String]

        init(_ raw: [String: JSONValue]) {
            func string(_ key: String) -> String {
                if case .string(let value) = raw[key] ?? .null { return value }
                return ""
            }
            func list(_ key: String) -> [String] {
                guard case .array(let items) = raw[key] ?? .null else { return [] }
                return items.compactMap { if case .string(let s) = $0 { return s } else { return nil } }
            }
            topic = string("topic")
            nodeLabel = string("nodeLabel")
            interests = string("interests")
            language = string("language")
            prereqLabels = list("prereqLabels")
            priorLabels = list("priorLabels")
            laterLabels = list("laterLabels")
        }
    }

    /// A streamed kind that runs here: its prompt, the part name its frames
    /// carry, and the prefix for the ids the server would have assigned.
    struct Streamed {
        let messages: [OpenRouter.Message]
        let part: String
        let idPrefix: String
    }

    /// The dispatcher. `nil` means "not ported" — the caller sends it to
    /// `/api/generate` as before, which is why an unported kind still works.
    static func streamed(_ kind: String, _ raw: [String: JSONValue]) -> Streamed? {
        let context = Context(raw)
        switch kind {
        case "consume": return Streamed(messages: consume(context), part: "chunks", idPrefix: "c")
        case "socratic": return Streamed(messages: socratic(context), part: "steps", idPrefix: "s")
        default: return nil
        }
    }

    /// `generateConsumeStream` — the reading pass, one section per object.
    private static func consume(_ c: Context) -> [OpenRouter.Message] {
        let known = c.prereqLabels.isEmpty
            ? "nothing yet — this is a foundation"
            : c.prereqLabels.joined(separator: ", ")
        return user("""
        Write the Consume (first reading) pass for the concept "\(c.nodeLabel)" within the topic "\(c.topic)".
        The learner already knows: \(known).
        \(interestNote(c.interests))

        \(sizeRule(unit: "sections", min: 2, max: 5,
                   atMin: "a concept with one mechanism and one way to get it wrong",
                   atMax: "a concept with several genuinely separate moving parts"))

        This is the READING phase — the learner is here to be taught, not tested. Write
        real teaching material: explain the idea, show where it comes from, work an
        example, name what usually goes wrong. Real questioning happens in later
        phases, so the pass carries no questions before the prose — only one short
        comprehension check per section ("check"), which closes it and which the
        learner must get right before continuing. A check is a receipt for reading,
        not a test: it asks for something stated or worked in THAT section's prose or
        example, and its wrong options are plausible misreadings, never absurd.

        Rules for the prose:
        - Teach, don't summarize. Each section's body is 2-5 full paragraphs of 3-6
          sentences — enough that a learner who reads only this understands the idea,
          and no more: a paragraph that restates the one above it is padding.
        - Be concrete: real numbers, real cases, the actual mechanism. No "it can be
          shown that", no bullet-point skeletons, no restating the section title.
        - Build in order: what it is → why it works / where it comes from → how it
          behaves → where it breaks or is misused → how it connects onward. That is the
          ORDER, not a checklist of five sections — a small concept covers several of
          those beats inside one section.
        - Name the common misconception explicitly and say why it is wrong.
        \(boundaryNote(prior: c.priorLabels, later: c.laterLabels))\(languageNote(c.language))

        Write the sections as SEPARATE top-level JSON objects, one after another
        — NOT wrapped in an array or a {"chunks": [...]} object, no markdown fences,
        no numbering, no commentary before/after/between them. Each object has this
        shape:
        \(consumeSectionShape)\(languageNote(c.language))
        """)
    }

    /// `generateSocraticStream` — the questioning script, one probe per object.
    /// The steps stay in one call: the prompt requires a progression, and four
    /// independent calls would each be written blind to the others.
    private static func socratic(_ c: Context) -> [OpenRouter.Message] {
        user("""
        Write a Socratic questioning session for the concept "\(c.nodeLabel)" within "\(c.topic)".
        The learner just finished a first reading. You are a contingent tutor: hint when near, teach when lost, and — most important — anti-sycophantic: a wrong reply is caught and named, gently but plainly.
        \(interestNote(c.interests))
        \(sizeRule(unit: "CORE probes", min: 2, max: 4,
                   atMin: "a single-mechanism idea with one way to get it wrong",
                   atMax: "a genuinely layered concept")) Each core probe uses a different move, in the order listed, and picks up where the last left off.
        Then write exactly 1 further probe marked "spare": true, last. A spare is held back — only ever asked of a learner who keeps needing help — so it must go DEEPER on the hardest part of the concept rather than restate an earlier probe.
        \(boundaryNote(prior: c.priorLabels, later: c.laterLabels))

        Write the steps as SEPARATE top-level JSON objects, one after
        another — NOT wrapped in an array or a {"steps": [...]} object, no markdown
        fences, no numbering, no commentary before/after/between them. Each object has
        this shape:
        \(socraticStepShape)

        \(socraticStepExample)\(languageNote(c.language))
        """)
    }
}
