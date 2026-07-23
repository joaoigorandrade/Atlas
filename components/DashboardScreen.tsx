"use client";

import type { DailyQueue, GoalKind } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface DashboardScreenProps {
  /** Time-of-day greeting ("Good morning") and the friendly display name. */
  greeting: string;
  name: string;
  /** Monospace date kicker at the top of the page. */
  dateLabel: string;
  /** Avatar initials for the profile button. */
  initials: string;
  /** Current adherence streak in days — honest, never fabricated. */
  streak: number;
  /** The honest review queue: minutes budget + cards due now. */
  queue: DailyQueue;
  /** True once today's target is met — the queue reads clear. */
  metToday: boolean;
  /** The subject of the current run (map title). */
  subject: string;
  /** The learner's goal — labels the map card. */
  goalLabel: string;
  /** The top frontier concept, or null when nothing is on the frontier yet. */
  frontierConcept: string | null;
  /** How many concepts sit on the frontier right now. */
  frontierTotal: number;
  /** Share of the map already mastered. */
  masteryPct: number;
  onOpenMap: () => void;
  onReview: () => void;
  onProfile: () => void;
  onNewMap: () => void;
}

const headerStyle = {
  flex: "0 0 auto",
  height: 58,
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 24px",
  background: "rgba(248,246,240,0.9)",
  backdropFilter: "blur(8px)",
  borderBottom: `1px solid ${color.hairline}`,
} as const;

const cardBase = {
  background: color.card,
  borderRadius: 16,
  padding: "24px 26px",
  cursor: "pointer",
  transition: "transform .12s, box-shadow .12s",
} as const;

export default function DashboardScreen({
  greeting,
  name,
  dateLabel,
  initials,
  streak,
  queue,
  metToday,
  subject,
  goalLabel,
  frontierConcept,
  frontierTotal,
  masteryPct,
  onOpenMap,
  onReview,
  onProfile,
  onNewMap,
}: DashboardScreenProps) {
  const mapStatus =
    masteryPct >= 100
      ? "Complete"
      : masteryPct > 0
        ? "In progress"
        : "Just started";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={headerStyle}>
        <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600 }}>
          Atlas
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            color: color.inkMuted,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#c99a2e",
              boxShadow: "0 0 8px rgba(201,154,46,0.6)",
            }}
          />
          <span style={{ fontWeight: 600, color: color.ink }}>{streak}</span> day
          streak
        </div>
        <button
          onClick={onProfile}
          title="Profile"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: color.ink,
            color: "#f7f5ef",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {initials}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "44px 40px 80px",
            animation: "fadeUp .5s both",
          }}
        >
          <div style={{ ...kicker(11), marginBottom: 10 }}>{dateLabel}</div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 38,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              margin: "0 0 6px",
            }}
          >
            {greeting}, {name}
          </h1>
          <div
            style={{
              fontSize: 15,
              color: color.inkMuted,
              marginBottom: 36,
            }}
          >
            {frontierTotal > 0
              ? `You're on the frontier of ${frontierTotal} concept${
                  frontierTotal === 1 ? "" : "s"
                }. Pick up where you left off.`
              : "Your map is fully mastered. Keep the memories fresh with review."}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 44,
            }}
          >
            <div
              onClick={onReview}
              style={{
                ...cardBase,
                border: "1px solid rgba(47,107,79,0.22)",
                boxShadow: "0 4px 16px rgba(47,107,79,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  ...kicker(10.5, "0.12em"),
                  color: color.accent,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: color.accent,
                  }}
                />
                Today&rsquo;s review
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 28,
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                {metToday
                  ? "Queue clear ✓"
                  : queue.cards > 0
                    ? `${queue.cards} card${queue.cards === 1 ? "" : "s"} due`
                    : "Nothing due yet"}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {metToday
                  ? "You've met today's target. New cards surface as memories start to fade."
                  : queue.cards > 0
                    ? `~${queue.minutes} min · timed to the moment these memories are about to fade.`
                    : "Learn a concept to the end and it starts feeding the review queue."}
              </div>
              <div
                style={{ fontSize: 13.5, color: color.accent, fontWeight: 600 }}
              >
                Start review &rarr;
              </div>
            </div>

            <div
              onClick={onOpenMap}
              style={{
                ...cardBase,
                border: "1px solid rgba(201,154,46,0.28)",
                boxShadow: "0 4px 16px rgba(201,154,46,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  ...kicker(10.5, "0.12em"),
                  color: color.amberInk,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#c99a2e",
                    boxShadow: "0 0 8px rgba(201,154,46,0.6)",
                  }}
                />
                Your frontier
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 28,
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                {frontierConcept ?? "All caught up"}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {frontierConcept
                  ? `The next concept you're ready to learn in ${subject}.`
                  : `Every concept in ${subject} is under way.`}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.amberInk,
                  fontWeight: 600,
                }}
              >
                Open the map &rarr;
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: font.serif, fontSize: 22 }}>Your maps</div>
            <button
              onClick={onNewMap}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 13.5,
                fontFamily: font.sans,
                color: color.accent,
                cursor: "pointer",
              }}
            >
              + New map
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 16,
            }}
          >
            <div
              onClick={onOpenMap}
              style={{
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 16,
                padding: "22px 22px 20px",
                cursor: "pointer",
                transition: "transform .12s, box-shadow .12s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <span style={kicker(10, "0.1em")}>{goalLabel}</span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: color.accent,
                    background: color.accentBg,
                    border: "1px solid rgba(47,107,79,0.2)",
                    borderRadius: 20,
                    padding: "3px 9px",
                  }}
                >
                  {mapStatus}
                </span>
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 20,
                  lineHeight: 1.15,
                  marginBottom: 18,
                  minHeight: 46,
                }}
              >
                {subject}
              </div>
              <div
                style={{
                  height: 6,
                  background: "#efe9df",
                  borderRadius: 5,
                  overflow: "hidden",
                  marginBottom: 9,
                }}
              >
                <div
                  style={{
                    width: `${masteryPct}%`,
                    height: "100%",
                    background: color.accent,
                    borderRadius: 5,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  color: color.inkFaint,
                }}
              >
                <span>{masteryPct}% mastered</span>
                <span>{frontierTotal} on frontier</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
