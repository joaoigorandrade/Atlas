"use client";

import { color, font } from "@/lib/theme";

/** One headline stat in the profile grid — value + caption, always live. */
export interface ProfileStat {
  value: string;
  label: string;
  /** Accent the value when it deserves emphasis (e.g. the streak). */
  accent?: boolean;
}

interface ProfileScreenProps {
  /** Friendly display name derived from the account, and the real email. */
  name: string;
  userEmail: string;
  /** Avatar initials. */
  initials: string;
  /** The four headline stats — streak, mastered, frontier, mastery. */
  stats: ProfileStat[];
  /** What the learner is working toward — the goal label. */
  goalLabel: string;
  /** Interests used for analogies & examples, one chip each. */
  interests: string[];
  /** Honest summary of the review schedule row. */
  reviewSummary: string;
  onHome: () => void;
  onReview: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}

const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 24px",
  cursor: "pointer",
  transition: "background .15s",
} as const;

export default function ProfileScreen({
  name,
  userEmail,
  initials,
  stats,
  goalLabel,
  interests,
  reviewSummary,
  onHome,
  onReview,
  onSettings,
  onSignOut,
}: ProfileScreenProps) {
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
      <div
        style={{
          flex: "0 0 auto",
          height: 58,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          onClick={onHome}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            fontFamily: font.sans,
            color: color.inkMuted,
          }}
        >
          &larr; Home
        </button>
        <div
          style={{
            width: 1,
            height: 20,
            background: color.hairlineStrong,
          }}
        />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: color.accent,
          }}
        >
          Profile
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "48px 40px 80px",
            animation: "fadeUp .5s both",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              marginBottom: 40,
            }}
          >
            <div
              style={{
                width: 78,
                height: 78,
                borderRadius: "50%",
                background: color.ink,
                color: "#f7f5ef",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 26,
                fontWeight: 600,
                flex: "0 0 auto",
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontFamily: font.serif,
                  fontWeight: 500,
                  fontSize: 30,
                  margin: "0 0 5px",
                }}
              >
                {name}
              </h1>
              <div style={{ fontSize: 14, color: color.inkMuted }}>
                {userEmail}
              </div>
            </div>
            <button
              onClick={onSettings}
              style={{
                flex: "0 0 auto",
                padding: "11px 18px",
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 11,
                fontSize: 14,
                fontFamily: font.sans,
                color: color.ink,
                cursor: "pointer",
              }}
            >
              Edit profile
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 14,
              marginBottom: 40,
            }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 26,
                    lineHeight: 1,
                    color: s.accent ? color.amberInk : color.ink,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: color.inkFaint,
                    marginTop: 6,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 16,
              padding: 26,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: color.inkFaint,
                marginBottom: 16,
              }}
            >
              Learning profile
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: color.inkMuted,
                marginBottom: 6,
              }}
            >
              Currently learning for
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 20,
                marginBottom: 22,
              }}
            >
              {goalLabel}
            </div>
            {interests.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 13.5,
                    color: color.inkMuted,
                    marginBottom: 11,
                  }}
                >
                  Interests &mdash; used for analogies &amp; examples
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 9 }}
                >
                  {interests.map((c) => (
                    <span
                      key={c}
                      style={{
                        padding: "7px 14px",
                        background: color.accentBg,
                        border: "1px solid rgba(47,107,79,0.22)",
                        borderRadius: 20,
                        fontSize: 13.5,
                        color: color.accent,
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div
            style={{
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              onClick={onSettings}
              style={{
                ...rowStyle,
                borderBottom: `1px solid ${color.hairline}`,
              }}
            >
              <div>
                <div style={{ fontSize: 15 }}>Preferences &amp; notifications</div>
                <div
                  style={{
                    fontSize: 13,
                    color: color.inkFaint,
                    marginTop: 2,
                  }}
                >
                  Daily target, reminders, voice, scaffolding
                </div>
              </div>
              <span style={{ color: color.inkGhost }}>&rarr;</span>
            </div>
            <div
              onClick={onReview}
              style={{
                ...rowStyle,
                borderBottom: `1px solid ${color.hairline}`,
              }}
            >
              <div>
                <div style={{ fontSize: 15 }}>Review schedule</div>
                <div
                  style={{
                    fontSize: 13,
                    color: color.inkFaint,
                    marginTop: 2,
                  }}
                >
                  {reviewSummary}
                </div>
              </div>
              <span style={{ color: color.inkGhost }}>&rarr;</span>
            </div>
            <div onClick={onSignOut} style={rowStyle}>
              <div style={{ fontSize: 15, color: "#c1574a" }}>Sign out</div>
              <span style={{ color: "#c1574a" }}>&rarr;</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
