"use client";

// The last resort: a throw in the root layout itself, which means neither
// `LanguageProvider` nor the fonts nor `globals.css` are guaranteed to have
// mounted. Next replaces the entire document with this, so it renders its own
// <html>/<body> and reaches for nothing — no theme import, no shared component,
// no hooks beyond the one that reports it.
//
// The language is read off `<html lang>` (which `LanguageProvider` sets, and
// which `app/layout.tsx` ships as pt-BR by default) rather than through
// context, because the provider is exactly what may have failed.

import { useEffect } from "react";

const STRINGS = {
  en: {
    kicker: "Atlas",
    title: "Atlas couldn't start.",
    body: "Nothing you've learned is lost — it lives in your account, not in this page.",
    reload: "Reload",
  },
  "pt-BR": {
    kicker: "Atlas",
    title: "O Atlas não conseguiu iniciar.",
    body: "Nada do que você aprendeu foi perdido — está na sua conta, não nesta página.",
    reload: "Recarregar",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang =
    typeof document !== "undefined" &&
    document.documentElement.lang.toLowerCase().startsWith("en")
      ? "en"
      : "pt-BR";
  const t = STRINGS[lang];

  useEffect(() => {
    console.error(
      JSON.stringify({
        evt: "global_error_boundary",
        error: String(error?.message ?? error).slice(0, 600),
        digest: error?.digest,
      }),
    );
  }, [error]);

  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f1ea",
          color: "#2c2823",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 40,
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#9a4034",
              marginBottom: 14,
            }}
          >
            {t.kicker}
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              lineHeight: 1.25,
              margin: "0 0 12px",
            }}
          >
            {t.title}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "#6b665c",
              margin: "0 0 22px",
            }}
          >
            {t.body}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "11px 18px",
              borderRadius: 11,
              border: "none",
              background: "#2f6b4f",
              color: "#f7f5ef",
              fontSize: 14.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.reload}
          </button>
        </div>
      </body>
    </html>
  );
}
