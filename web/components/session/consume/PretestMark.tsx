"use client";

// What a section's pretest came to, worn on the section afterwards: on a folded
// one, that the learner already had it; on an opened one, that their guess
// missed and the answer is in the prose below. Either way with the ink the bet
// won or lost — and, on a miss they were very sure of, why that one matters.

import { BLUE, STRINGS, WRONG } from "./shared";
import { inkDelta } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, kicker } from "@/lib/theme";

export function PretestMark({ known, stake }: { known: boolean; stake?: number }) {
  const t = useT(STRINGS);
  const ink =
    stake === undefined
      ? ""
      : ` · ${known ? t.inkWon(inkDelta(stake, true)) : t.inkLost(-inkDelta(stake, false))}`;
  return (
    <div data-testid={known ? "consume-pretest-known" : "consume-pretest-missed"}>
      <div style={{ ...kicker(9.5, "0.1em", known ? BLUE : WRONG), marginBottom: 6 }}>
        {known ? t.pretestKnown : t.pretestMissedMark}
        {ink}
      </div>
      {!known && stake === 2 && (
        <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 14 }}>
          {t.confidentMiss}
        </div>
      )}
    </div>
  );
}
