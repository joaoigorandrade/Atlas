// Privacy & data page (#33). Static, reachable signed-out (see middleware).
// Plain-language account of what Atlas stores and how to remove it.

import { color, font, kicker } from "@/lib/theme";

export const metadata = { title: "Privacy & data · Atlas" };

const P: React.CSSProperties = {
  fontSize: 15.5,
  lineHeight: 1.65,
  color: color.inkSoft,
  margin: "0 0 18px",
};
const H: React.CSSProperties = {
  fontFamily: font.serif,
  fontWeight: 500,
  fontSize: 21,
  margin: "34px 0 12px",
  color: color.ink,
};

export default function PrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: color.paper,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <main style={{ width: "100%", maxWidth: 640, padding: "64px 28px 96px" }}>
        <a href="/" style={{ fontSize: 13.5, color: color.inkMuted }}>
          ← Atlas
        </a>
        <div style={{ ...kicker(11, "0.2em"), margin: "28px 0 14px" }}>
          Privacy &amp; data
        </div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 28px",
          }}
        >
          What Atlas keeps, and how to take it back
        </h1>

        <p style={P}>
          Atlas stores only what it needs to run your learning loop across
          sessions. No advertising, no data sales, no third-party trackers.
        </p>

        <h2 style={H}>What we store</h2>
        <p style={P}>
          <strong>Your account.</strong> Your email address and a password,
          used only to sign you in. The password is stored hashed by our auth
          provider — never in plain text, never seen by us.
        </p>
        <p style={P}>
          <strong>Your run state.</strong> Your concept map, mastery states,
          review cards and their schedule, streak, and settings — one record
          keyed to your account. This is what survives a refresh.
        </p>
        <p style={P}>
          <strong>Generation log.</strong> A per-call record (which kind of
          content, when) used to enforce fair-use limits. It holds no learning
          content.
        </p>

        <h2 style={H}>What we send to third parties</h2>
        <p style={P}>
          Learning content is written by a language model reached through
          OpenRouter. Your topic and interests are part of those prompts; your
          email and account are never sent. Hosting and the database are
          provided by Vercel and Supabase.
        </p>

        <h2 style={H}>Deleting your data</h2>
        <p style={P}>
          Open <strong>Settings → Account → Delete account &amp; all data</strong>.
          That removes your run state and generation log immediately, and your
          account with them. It cannot be undone.
        </p>

        <p style={{ ...P, marginTop: 34, color: color.inkGhost, fontSize: 13.5 }}>
          Questions about your data? Reach out to the account you signed up
          with.
        </p>
      </main>
    </div>
  );
}
