"use client";

import type { OnboardingForm } from "@/lib/curriculum";
import type { ScopeOffer } from "@/lib/api";
import ScopeOffers from "@/components/onboarding/ScopeOffers";
import TopicComposer from "@/components/onboarding/TopicComposer";
import type { OutlineUpload } from "@/components/atlas/outlineUpload";
import { CompassRose } from "@/components/ui/Ornaments";
import { color, font, kicker, motion } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

// The atlas opened at its cover: what to learn (`TopicComposer` — the topic and
// an optional source), and nothing else. There is one flow, so nothing to pick.

const STRINGS = {
  en: {
    back: "← Your atlas",
    kicker: "Atlas · learn anything",
    title: "What do you want to learn?",
    build: "Start →",
    footer: "One to four concepts · read, explain, do, keep — then a mock exam",
  },
  "pt-BR": {
    back: "← Seu atlas",
    kicker: "Atlas · aprenda qualquer coisa",
    title: "O que você quer aprender?",
    build: "Começar →",
    footer:
      "De um a quatro conceitos · leia, explique, faça, guarde — e uma prova no fim",
  },
} as const;

interface WelcomeScreenProps {
  form: OnboardingForm;
  onChange: (patch: Partial<OnboardingForm>) => void;
  onBuild: () => void;
  /** Back to the dashboard — only when the learner already has a map to go back to. */
  onBack?: () => void;
  /** Uploaded-outline grounding (#30), read by the composer. */
  upload: OutlineUpload;
  /** Scoped sub-map offers when the topic was too broad, else null (#30). */
  scopes: ScopeOffer[] | null;
  onPickScope: (label: string) => void;
  /** Take every offer at once, as one continent (`useContinents.chartAll`). */
  onChartContinent: () => void;
}

export default function WelcomeScreen({
  form,
  onChange,
  onBuild,
  onBack,
  upload,
  scopes,
  onPickScope,
  onChartContinent,
}: WelcomeScreenProps) {
  const t = useT(STRINGS);
  const ready = form.topic.trim().length > 0;

  return (
    <div
      data-testid="screen-welcome"
      className="at-endpaper"
      style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "56px 16px" }}
    >
      {onBack && (
        <button
          type="button"
          className="at-press"
          data-testid="action-back-dashboard"
          onClick={onBack}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: color.card,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 3,
            padding: "7px 14px",
            cursor: "pointer",
            fontFamily: font.display,
            fontStyle: "italic",
            fontSize: 15.5,
            color: color.inkMuted,
          }}
        >
          {t.back}
        </button>
      )}
      <div
        className="at-deckle"
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "44px clamp(20px, 7vw, 60px) 52px",
          background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
          boxShadow: "0 30px 60px rgba(10,8,6,0.45), 0 2px 0 rgba(10,8,6,0.2)",
          animation: `fadeUp ${motion.duration.deliberate}ms ${motion.ease.enter} both`,
        }}
      >
        <div
          className="at-stagger at-welcome-head"
          style={{ textAlign: "center", marginBottom: 28 }}
        >
          <CompassRose size={46} />
          <div style={{ ...kicker(12, "0.22em"), margin: "14px 0 12px" }}>{t.kicker}</div>
          <h1
            style={{
              fontFamily: font.display,
              fontWeight: 400,
              fontSize: "clamp(34px, 7vw, 48px)",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {t.title}
          </h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onBuild();
          }}
        >
          <TopicComposer
            label={t.title}
            topic={form.topic}
            onTopic={(topic) => onChange({ topic })}
            upload={upload}
          />

          {scopes && (
            <div style={{ marginTop: 24 }}>
              <ScopeOffers
                topic={form.topic}
                scopes={scopes}
                onPick={onPickScope}
                onChartAll={onChartContinent}
              />
            </div>
          )}

          <Button
            data-testid="action-build"
            type="submit"
            disabled={!ready}
            // Pinned while the form scrolls (on a phone it sat a screen below the
            // field) — once it can be pressed; a faded one would sit over the cards.
            style={{
              marginTop: 32,
              ...(ready && { position: "sticky", bottom: 12, zIndex: 2 }),
            }}
          >
            {t.build}
          </Button>
        </form>
        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 13,
            color: color.inkGhost,
          }}
        >
          {t.footer}
        </div>
      </div>
    </div>
  );
}
