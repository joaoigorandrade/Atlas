"use client";

// The question on a review card, filled or blank. Lifted out of RetainCard to
// keep that file under its size ceiling.

import { STATE_COLOR, type ReviewCard } from "@/lib/curriculum";
import { color, font, motion } from "@/lib/theme";
import Rich from "@/components/Rich";

/** How long the card takes to turn over. The faces swap `visibility` at the
 *  half-way point so the hidden face can never be clicked mid-turn. */
export const FLIP_MS = motion.duration.deliberate;

/** The question, filled or blank — shared by both faces of the card so the
 *  answer lands *in* the sentence it belongs to rather than beside it. */
export function Question({
  card,
  filled,
  size,
  ink = color.ink,
}: {
  card: ReviewCard;
  filled: boolean;
  size: number;
  ink?: string;
}) {
  const text = { fontFamily: font.serif, fontSize: size, lineHeight: 1.4, color: ink };
  if (!card.cloze)
    return (
      <div style={text}>
        <Rich text={card.front} />
      </div>
    );
  return (
    <div style={text}>
      <Rich text={card.cloze[0]} />
      <span
        style={{
          display: "inline-block",
          minWidth: 96,
          borderBottom: `2px solid ${filled ? STATE_COLOR.mastered : "rgba(43,33,24,0.28)"}`,
          textAlign: "center",
        }}
      >
        {filled ? (
          <span
            style={{
              color: STATE_COLOR.mastered,
              display: "inline-block",
              animation: `clozeReveal .34s ${motion.ease.spring} both ${FLIP_MS / 2}ms`,
            }}
          >
            {card.answer}
          </span>
        ) : (
          " "
        )}
      </span>
      <Rich text={card.cloze[1]} />
    </div>
  );
}
