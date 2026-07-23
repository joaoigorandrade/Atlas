"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { color, font, kicker } from "@/lib/theme";

interface LoginScreenProps {
  /** Set when /auth/confirm rejected a confirmation link (expired / reused). */
  linkError?: boolean;
}

type Mode = "signin" | "signup";
type Status = "idle" | "working" | "sent" | "error";

export default function LoginScreen({ linkError }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState(
    linkError
      ? "That confirmation link expired or was already used — sign in again below."
      : "",
  );

  const submit = () => {
    const address = email.trim();
    if (!address || !address.includes("@")) {
      setStatus("error");
      setMessage("Enter the email for your account.");
      return;
    }
    if (password.length < 6) {
      setStatus("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setStatus("working");
    setMessage("");
    const supabase = createClient();

    if (mode === "signin") {
      supabase.auth
        .signInWithPassword({ email: address, password })
        .then(({ error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
          } else {
            // Full navigation so middleware sees the fresh session cookies.
            window.location.assign("/");
          }
        });
    } else {
      supabase.auth
        .signUp({
          email: address,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        })
        .then(({ data, error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
          } else if (data.session) {
            // Email confirmation disabled — signed in immediately.
            window.location.assign("/");
          } else {
            // Email confirmation required — user must click the link.
            setStatus("sent");
          }
        });
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus("idle");
    setMessage("");
  };

  const working = status === "working";

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
          {mode === "signin" ? "Sign in to your map" : "Create your account"}
        </h1>
        <div style={{ fontSize: 14.5, color: color.inkMuted, marginBottom: 36 }}>
          Your map, streak, and progress live in your account
          {mode === "signin"
            ? " — sign in with your email and password."
            : " — pick an email and password to get started."}
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
              Confirm your email
            </div>
            We sent a confirmation link to {email.trim()}. Open it to activate
            your account, then come back and sign in.
          </div>
        ) : (
          <>
            <div
              style={{
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 14,
                padding: 6,
                marginBottom: 12,
                boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
              }}
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                autoFocus
                style={inputStyle}
              />
            </div>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="Password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                style={inputStyle}
              />
            </div>
            <button
              onClick={submit}
              disabled={working}
              style={{
                width: "100%",
                padding: 17,
                background: color.accent,
                color: color.accentInk,
                border: "none",
                borderRadius: 13,
                fontSize: 16,
                fontWeight: 600,
                cursor: working ? "default" : "pointer",
                opacity: working ? 0.7 : 1,
                boxShadow: "0 10px 28px rgba(47,107,79,0.28)",
              }}
            >
              {working
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                  ? "Sign in →"
                  : "Create account →"}
            </button>

            <div
              style={{
                marginTop: 20,
                fontSize: 14,
                color: color.inkMuted,
                textAlign: "center",
              }}
            >
              {mode === "signin" ? (
                <>
                  New to Atlas?{" "}
                  <button onClick={() => switchMode("signup")} style={linkStyle}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => switchMode("signin")} style={linkStyle}>
                    Sign in
                  </button>
                </>
              )}
            </div>
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

const inputStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  fontFamily: font.serif,
  fontSize: 20,
  color: color.ink,
  padding: "14px 16px",
  outline: "none",
} as const;

const linkStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: 14,
  fontWeight: 600,
  color: color.accent,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
} as const;
