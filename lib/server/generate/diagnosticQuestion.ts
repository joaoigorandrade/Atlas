// ---- one placement question, as the model writes it ------------------------
// Split from `map.ts`: the placement is its own generation now (`summary.ts`),
// and its validator changes for its own reasons — a new probe kind, a new key.

import { arr, fail, obj, slug, str } from "./common";
import { asDiagnosticKind, type DiagnosticKind } from "@/lib/curriculum";

/** One placement question, before `tag` and `difficulty` are attached. */
export interface RawDiagnostic {
  nodeId: string;
  q: string;
  note: string;
  type: DiagnosticKind;
  opts: Array<{ label: string }>;
  correctIndex: number;
  /** The answer key, shaped by `type` — see `DiagnosticQuestion.expected`. */
  expected?: string[];
  gapLabel?: string;
  gapReason?: string;
}

/** One objective placement question, checked against the offered node
 *  candidates and the model's own option count. */
export function validateDiagnosticQuestion(
  raw: unknown,
  nodeIds: Set<string>,
): RawDiagnostic {
  const d = obj(raw, "payload");
  const nodeId = slug(d.nodeId, "nodeId");
  if (!nodeIds.has(nodeId))
    fail(`nodeId "${nodeId}" is not one of the offered candidates`);
  const type = asDiagnosticKind(d.type);
  // Each kind carries exactly what `gradeDiagnostic` needs to rule on it, and
  // nothing else. A kind whose answer key is missing is unmarkable, so it
  // fails here rather than passing every learner silently.
  const opts =
    type === "mcq" || type === "order"
      ? arr(d.opts, "opts", type === "mcq" ? 4 : 3, type === "mcq" ? 4 : 6).map(
          (o, j) => ({ label: str(o, `opts[${j}]`) }),
        )
      : [];
  let expected: string[] | undefined;
  if (type === "compute") expected = [str(d.expected, "expected")];
  else if (type === "speak")
    expected = arr(d.accept, "accept", 1, 6).map((a, j) => str(a, `accept[${j}]`));
  else if (type === "order") {
    expected = arr(d.correctOrder, "correctOrder", opts.length, opts.length).map((o, j) =>
      str(o, `correctOrder[${j}]`),
    );
    const labels = new Set(opts.map((o) => o.label));
    for (const label of expected)
      if (!labels.has(label))
        fail(`correctOrder names "${label}", which is not one of the options`);
    // Membership alone let `["A","A","B"]` through, which `checkOrder` compares
    // element-wise — an unpassable probe that then spawns a gap off the answer.
    if (new Set(expected).size !== expected.length)
      fail("correctOrder must use each option exactly once");
  }
  if (type === "mcq") {
    if (
      typeof d.correctIndex !== "number" ||
      !Number.isInteger(d.correctIndex) ||
      d.correctIndex < 0 ||
      d.correctIndex > 3
    )
      fail("correctIndex must be an integer 0-3");
  }
  return {
    nodeId,
    q: str(d.q, "q"),
    note: str(d.note, "note"),
    type,
    opts,
    // -1 is the honest value where there is nothing to pick, and is what
    // `gradeDiagnostic` will never match against.
    correctIndex: type === "mcq" ? (d.correctIndex as number) : -1,
    expected,
    gapLabel: d.gapLabel ? str(d.gapLabel, "gapLabel") : undefined,
    gapReason: d.gapReason ? str(d.gapReason, "gapReason") : undefined,
  };
}
