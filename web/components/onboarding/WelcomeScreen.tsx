"use client";

import type { OnboardingForm } from "@/lib/curriculum";
import type { ScopeOffer } from "@/lib/api";
import MasteryDetails from "@/components/onboarding/MasteryDetails";
import ScopeOffers from "@/components/onboarding/ScopeOffers";
import TopicComposer from "@/components/onboarding/TopicComposer";
import type { OutlineUpload } from "@/components/atlas/outlineUpload";
import { CompassRose, Fleuron } from "@/components/ui/Ornaments";
import { color, font, kicker, motion, alpha } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

// The atlas opened at its cover: what (`TopicComposer` — the topic and an
// optional source), then how far. "Just want to know" asks nothing more;
// "Mastery" unfolds the full setup underneath.

const STRINGS = {
  en: {
    back: "← Your atlas",
    kicker: "Atlas · learn anything",
    title: "What do you want to learn?",
    modes: "How far do you want to go?",
    glance: "Just want to know",
    glanceBody: "One to three stops. Read it, see how to explain it, try it once.",
    glanceMeta: "minutes · no test",
    mastery: "Mastery",
    masteryBody: "The full atlas: a placement test, a deep ladder on every concept.",
    masteryMeta: "weeks · paced to your goal",
    buildGlance: "Show me →",
    buildMastery: "Build my map →",
    footerGlance: "Straight to the map — no placement, nothing to set up",
    footerMastery: "~5 minutes to a lit-up map with a clear frontier",
  },
  "pt-BR": {
    back: "← Seu atlas",
    kicker: "Atlas · aprenda qualquer coisa",
    title: "O que você quer aprender?",
    modes: "Até onde você quer ir?",
    glance: "Só quero saber",
    glanceBody: "De uma a três paradas. Leia, veja como explicar, tente uma vez.",
    glanceMeta: "minutos · sem teste",
    mastery: "Domínio",
    masteryBody:
      "O atlas completo: teste de nivelamento e uma escada funda em cada conceito.",
    masteryMeta: "semanas · no ritmo do seu objetivo",
    buildGlance: "Me mostre →",
    buildMastery: "Montar meu mapa →",
    footerGlance: "Direto para o mapa — sem nivelamento, nada para configurar",
    footerMastery: "~5 minutos para um mapa aceso com uma fronteira clara",
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

/** One of the two ways in: a plate that reads as a choice, not a setting. */
function ModeCard(props: {
  id: "glance" | "mastery";
  active: boolean;
  title: string;
  body: string;
  meta: string;
  onPick: () => void;
}) {
  const { active } = props;
  return (
    <button
      className="at-press"
      type="button"
      role="radio"
      aria-checked={active}
      data-testid={`action-mode-${props.id}`}
      onClick={props.onPick}
      style={{
        flex: "1 1 220px",
        display: "flex",
        gap: 12,
        textAlign: "left",
        padding: "16px 18px",
        background: active ? color.accentBg : color.card,
        border: `1px solid ${active ? color.accent : color.hairlineStrong}`,
        boxShadow: active
          ? `inset 0 0 0 3px ${color.card}, inset 0 0 0 4px ${alpha(color.accent, 33)}`
          : "none",
        borderRadius: 3,
        cursor: "pointer",
        color: color.ink,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 14,
          height: 14,
          marginTop: 6,
          borderRadius: "50%",
          border: `1.5px solid ${active ? color.accent : color.inkGhost}`,
          background: active ? color.accent : "transparent",
          boxShadow: active ? `inset 0 0 0 2.5px ${color.accentBg}` : "none",
        }}
      />
      <span>
        <span
          style={{
            display: "block",
            fontFamily: font.display,
            fontSize: 22,
            lineHeight: 1.15,
            color: active ? color.accent : color.ink,
            marginBottom: 6,
          }}
        >
          {props.title}
        </span>
        <span
          style={{
            display: "block",
            fontFamily: font.serif,
            fontSize: 15,
            lineHeight: 1.4,
            color: color.inkSoft,
          }}
        >
          {props.body}
        </span>
        <span
          style={{
            display: "block",
            ...kicker(11, "0.16em"),
            marginTop: 10,
            color: active ? color.accent : color.inkFaint,
          }}
        >
          {props.meta}
        </span>
      </span>
    </button>
  );
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
  const quick = form.goal === "glance";
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
        <div style={{ textAlign: "center", marginBottom: 28 }}>
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

          <div style={{ ...kicker(11.5, "0.18em"), margin: "30px 0 12px" }}>
            {t.modes}
          </div>
          <div
            role="radiogroup"
            aria-label={t.modes}
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <ModeCard
              id="glance"
              active={quick}
              title={t.glance}
              body={t.glanceBody}
              meta={t.glanceMeta}
              onPick={() => onChange({ goal: "glance" })}
            />
            <ModeCard
              id="mastery"
              active={!quick}
              title={t.mastery}
              body={t.masteryBody}
              meta={t.masteryMeta}
              // Mastery's own goals; "exam" is what the full flow always defaulted to.
              onPick={() => quick && onChange({ goal: "exam" })}
            />
          </div>

          {!quick && (
            <div style={{ marginTop: 30, animation: "fadeUp 0.25s both" }}>
              <Fleuron style={{ margin: "0 60px 28px" }} />
              <MasteryDetails form={form} onChange={onChange} />
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
            {quick ? t.buildGlance : t.buildMastery}
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
          {quick ? t.footerGlance : t.footerMastery}
        </div>
      </div>
    </div>
  );
}
