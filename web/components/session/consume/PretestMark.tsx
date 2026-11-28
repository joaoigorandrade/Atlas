"use client";

// What a section's pretest came to, worn on the section afterwards: on a folded
// one, that the learner already had it; on an opened one, that their guess
// missed and the answer is in the prose below — or that it was right but bet
// "not sure", so the section is read anyway. Either way with the ink the bet
// won or lost — and, on a miss they were very sure of, why that one matters.
// Renders nothing for a section whose pretest has nothing to say.

import { BLUE, STRINGS, WRONG } from "./shared";
import { type ConsumeProgress } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, kicker } from "@/lib/theme";

export function PretestMark({
  p,
  id,
  folded = false,
}: {
  p: ConsumeProgress;
  id: string;
  /** Worn on the folded takeaway rather than over the open prose. */
  folded?: boolean;
}) {
  const t = useT(STRINGS);
  const right = p.pretest[id];
  // Folded: only a known section says so. Open: once guessed, until checked.
  if (folded ? !right : right === undefined || p.checks[id]) return null;
  const stake = p.stakes[id];
  return (
    <div data-testid={right ? "consume-pretest-known" : "consume-pretest-missed"}>
      <div style={{ ...kicker(9.5, "0.1em", right ? BLUE : WRONG), marginBottom: 6 }}>
        {folded ? t.pretestKnown : right ? t.pretestGuessed : t.pretestMissedMark}
      </div>
      {!right && stake === 2 && (
        <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 14 }}>
          {t.confidentMiss}
        </div>
      )}
    </div>
  );
}
