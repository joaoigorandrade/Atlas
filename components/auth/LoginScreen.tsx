"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { color, font, kicker } from "@/lib/theme";

interface LoginScreenProps {
  /** Set when /auth/confirm rejected the magic link (expired / reused). */
  linkError?: boolean;
}

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginScreen({ linkError }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState(
    linkError ? "That sign-in link expired or was already used — request a fresh one." : "",
  );

  const sendLink = () => {
    const address = email.trim();
    if (!address || !address.includes("@")) {
      setStatus("error");
      setMessage("Enter the email you want the sign-in link sent to.");
      return;
    }
    setStatus("sending");
    setMessage("");
    const supabase = createClient();
    supabase.auth
      .signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setMessage(error.message);
        } else {
          setStatus("sent");
        }
      });
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        background: color.paper,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "110px 40px 90px",
          animation: "fadeUp 0.5s both",
        }}
      >
        <div style={{ ...kicker(11, "0.2em"), marginBottom: 18 }}>
          Atlas · learn anything, deeply
        </div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            margin: "0 0 14px",
          }}
        >
          Sign in to your map
        </h1>
        <div style={{ fontSize: 14.5, color: color.inkMuted, marginBottom: 36 }}>
          Your map, streak, and progress live in your account — we email you a
          sign-in link, no password to remember.
        </div>

        {status === "sent" ? (
          <div
            style={{
              background: color.successBg,
              border: "1px solid rgba(47,107,79,0.22)",
              borderRadius: 13,
              padding: "22px 20px",
              fontSize: 15,
              color: color.accent,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Check your inbox
            </div>
            We sent a sign-in link to {email.trim()}. Open it on this device and
            you&apos;ll land back here, signed in.
          </div>
        ) : (
          <>
            <div
              style={{
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 14,
                padding: 6,
                marginBottom: 14,
                boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
              }}
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendLink();
                }}
                placeholder="you@example.com"
                type="email"
                autoFocus
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  fontFamily: font.serif,
                  fontSize: 20,
                  color: color.ink,
                  padding: "14px 16px",
                }}
              />
            </div>
            <button
              onClick={sendLink}
              disabled={status === "sending"}
              style={{
                width: "100%",
                padding: 17,
                background: color.accent,
                color: color.accentInk,
                border: "none",
                borderRadius: 13,
                fontSize: 16,
                fontWeight: 600,
                cursor: status === "sending" ? "default" : "pointer",
                opacity: status === "sending" ? 0.7 : 1,
                boxShadow: "0 10px 28px rgba(47,107,79,0.28)",
              }}
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link →"}
            </button>
          </>
        )}

        {message && status !== "sent" && (
          <div
            style={{
              marginTop: 16,
              fontSize: 13.5,
              color: color.amberInk,
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.2)",
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
