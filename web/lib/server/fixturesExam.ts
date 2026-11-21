// Fixture mode's mock exam (see `fixtures.ts`): no model, a key a spec can
// answer by index.

import { asExamSize, type ExamQuestion } from "@/lib/curriculum";
import { poolOf, type GenerateBody } from "./jobInput";

/** A mock exam whose key walks the four slots, so a spec can answer it right
 *  (or wrong) by index without a model choosing either. */
export function examFixture(body: GenerateBody): ExamQuestion[] {
  const pool = poolOf(body);
  const count = asExamSize(body.count);
  return Array.from({ length: pool.length ? count : 0 }, (_, i) => {
    const node = pool[i % pool.length];
    return {
      id: `ex-${i + 1}`,
      nodeId: node.id,
      q: `Question ${i + 1}: which statement about ${node.label} holds?`,
      opts: [0, 1, 2, 3].map((j) => `${node.label} — statement ${j + 1}`),
      correctIndex: i % 4,
      explain: `Statement ${(i % 4) + 1} is the one ${node.label} guarantees.`,
    };
  });
}
