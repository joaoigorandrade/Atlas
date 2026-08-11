"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InkDots } from "@/components/Pending";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Atlas · learn anything, deeply",
    linkError:
      "That confirmation link expired or was already used — sign in again below.",
    confirmUnavailable:
      "We couldn't check that link just now — nothing is wrong with your account. Try the link again, or sign in below.",
    enterEmail: "Enter the email for your account.",
    passwordMin: "Password must be at least 6 characters.",
    signInTitle: "Sign in to your map",
    signUpTitle: "Create your account",
    subtitleBase: "Your map, streak, and progress live in your account",
    subtitleSignin: " — sign in with your email and password.",
    subtitleSignup: " — pick an email and password to get started.",
    confirmEmailTitle: "Confirm your email",
    confirmEmailBody: (email: string) =>
      `We sent a confirmation link to ${email}. Open it to activate your account, then come back and sign in.`,
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Password",
    signingIn: "Signing in",
    creatingAccount: "Creating account",
    signIn: "Sign in →",
    createAccount: "Create account →",
    newToAtlas: "New to Atlas?",
    createAnAccount: "Create an account",
    alreadyHaveAccount: "Already have an account?",
    signInLink: "Sign in",
  },
  "pt-BR": {
    kicker: "Atlas · aprenda qualquer coisa, a fundo",
    linkError:
      "Esse link de confirmação expirou ou já foi usado — entre novamente abaixo.",
    confirmUnavailable:
      "Não conseguimos verificar esse link agora — não há nada de errado com sua conta. Tente o link de novo, ou entre abaixo.",
    enterEmail: "Digite o e-mail da sua conta.",
    passwordMin: "A senha precisa ter pelo menos 6 caracteres.",
    signInTitle: "Entre no seu mapa",
    signUpTitle: "Crie sua conta",
    subtitleBase: "Seu mapa, sequência e progresso ficam na sua conta",
    subtitleSignin: " — entre com seu e-mail e senha.",
    subtitleSignup: " — escolha um e-mail e senha para começar.",
    confirmEmailTitle: "Confirme seu e-mail",
    confirmEmailBody: (email: string) =>
      `Enviamos um link de confirmação para ${email}. Abra-o para ativar sua conta e depois volte para entrar.`,
    emailPlaceholder: "voce@exemplo.com",
    passwordPlaceholder: "Senha",
    signingIn: "Entrando",
    creatingAccount: "Criando conta",
    signIn: "Entrar →",
    createAccount: "Criar conta →",
    newToAtlas: "Novo no Atlas?",
    createAnAccount: "Criar uma conta",
    alreadyHaveAccount: "Já tem uma conta?",
    signInLink: "Entrar",
  },
} as const;

interface LoginScreenProps {
  /**
   * The `?error=` /auth/confirm redirected with. `link`/`expired` mean the link
   * itself is spent; `unavailable` means we couldn't check it — which is worth
   * saying differently, because "your link expired" is a lie that makes a
   * learner give up on a link that would work in a minute.
   */
  notice?: string;
}

type Mode = "signin" | "signup";
type Status = "idle" | "working" | "sent" | "error";

export default function LoginScreen({ notice }: LoginScreenProps) {
  const t = useT(STRINGS);
  const noticeText =
    notice === "unavailable"
      ? t.confirmUnavailable
      : notice === "link" || notice === "expired"
        ? t.linkError
        : "";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  // Null means "nothing has happened yet, so show the notice we arrived with".
  // Seeding this from `noticeText` instead froze the sentence at the language
  // of the first render — `LanguageProvider` resolves the real language in an
  // effect, so the notice stayed pt-BR on an English browser while every other
  // string on the screen switched.
  const [message, setMessage] = useState<string | null>(null);
  const shownMessage = message ?? noticeText;

  const submit = () => {
    const address = email.trim();
    if (!address || !address.includes("@")) {
      setStatus("error");
      setMessage(t.enterEmail);
      return;
    }
    if (password.length < 6) {
      setStatus("error");
      setMessage(t.passwordMin);
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
    // "" rather than null: switching modes deliberately clears the arrival
    // notice, where null would bring it back.
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
          {t.kicker}
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
          {mode === "signin" ? t.signInTitle : t.signUpTitle}
        </h1>
        <div style={{ fontSize: 14.5, color: color.inkMuted, marginBottom: 36 }}>
          {t.subtitleBase}
          {mode === "signin" ? t.subtitleSignin : t.subtitleSignup}
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
              {t.confirmEmailTitle}
            </div>
            {t.confirmEmailBody(email.trim())}
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
                placeholder={t.emailPlaceholder}
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
                placeholder={t.passwordPlaceholder}
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                style={inputStyle}
              />
            </div>
            <button
              className="at-press"
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
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {working ? (
                <>
                  {mode === "signin" ? t.signingIn : t.creatingAccount}
                  <InkDots size={4} tone={color.accentInk} />
                </>
              ) : mode === "signin" ? (
                t.signIn
              ) : (
                t.createAccount
              )}
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
                  {t.newToAtlas}{" "}
                  <button
                    className="at-press"
                    onClick={() => switchMode("signup")}
                    style={linkStyle}
                  >
                    {t.createAnAccount}
                  </button>
                </>
              ) : (
                <>
                  {t.alreadyHaveAccount}{" "}
                  <button
                    className="at-press"
                    onClick={() => switchMode("signin")}
                    style={linkStyle}
                  >
                    {t.signInLink}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {shownMessage && status !== "sent" && (
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
            {shownMessage}
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
