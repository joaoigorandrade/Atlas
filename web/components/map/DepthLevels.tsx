"use client";

// The drawer's level row: I · II · III for a concept the map gave deeper
// levels, and the quiet way into the next one once the current level is
// mastered. A level is bonus — nothing here nudges, and ignoring it costs
// nothing anywhere else.

import {
  STATE_COLOR,
  baseIdOf,
  levelsOf,
  type ConceptNode,
  type NodeState,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { STRINGS } from "@/components/map/nodeDetailCopy";
import Button from "@/components/ui/Button";

export const ROMAN = ["I", "II", "III"] as const;

export default function DepthLevels({
  node,
  nodes,
  display,
  onSelect,
  onGoDeeper,
}: {
  /** The selected node — a base, or one of its spawned levels. */
  node: ConceptNode;
  nodes: ConceptNode[];
  display: Record<string, NodeState>;
  onSelect: (id: string) => void;
  onGoDeeper?: (fromId: string) => void;
}) {
  const t = useT(STRINGS);
  const base = nodes.find((n) => n.id === baseIdOf(node.id));
  const levels = base ? levelsOf({ nodes }, base) : [];
  if (!base || !onGoDeeper || levels.length === 0) return null;
  const at = (node.depth ?? 1) - 1;
  // The next level's spec, while it is unreached and this one is mastered.
  const offer =
    display[node.id] === "mastered" && levels[at + 1] === null ? base.deeper![at] : null;

  return (
    <div data-testid="depth-levels" style={{ marginBottom: 24 }}>
      <div style={{ ...kicker(10), marginBottom: 10 }}>{t.levels}</div>
      <div role="tablist" style={{ display: "flex", gap: 6 }}>
        {levels.map((level, i) => {
          const mastered = !!level && display[level.id] === "mastered";
          return (
            <button
              key={i}
              role="tab"
              className="at-press"
              data-testid={`level-${i + 1}`}
              aria-selected={i === at}
              disabled={!level}
              title={level?.label ?? t.levelLocked}
              onClick={() => level && level.id !== node.id && onSelect(level.id)}
              style={{
                minWidth: 40,
                padding: "5px 10px",
                fontFamily: font.display,
                fontSize: 14,
                borderRadius: 7,
                cursor: level ? "pointer" : "default",
                color: level ? color.ink : color.inkGhost,
                background: mastered ? color.successBg : color.card,
                border: `1px solid ${
                  i === at
                    ? color.accent
                    : mastered
                      ? STATE_COLOR.mastered
                      : color.hairlineStrong
                }`,
              }}
            >
              {ROMAN[i]}
            </button>
          );
        })}
      </div>
      {offer && (
        <>
          <Button
            variant="quiet"
            accent={color.inkMuted}
            data-testid="action-go-deeper"
            onClick={() => onGoDeeper(node.id)}
            style={{ marginTop: 12, fontSize: 14 }}
          >
            {t.goDeeper(ROMAN[at + 1])}
          </Button>
          <div
            style={{
              marginTop: 8,
              fontFamily: font.serif,
              fontSize: 14,
              lineHeight: 1.45,
              color: color.inkMuted,
            }}
          >
            {offer.summary}
          </div>
        </>
      )}
    </div>
  );
}
