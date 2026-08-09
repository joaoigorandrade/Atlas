"use client";

import {
  CONNECT_COLOR,
  STATE_COLOR,
  connectCards,
  connectLinkedCount,
  connectReady,
  mnemonicToolsOff,
  type ConnectSession,
  type ElaborationContent,
  type ElaborationLink,
} from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

import Rich from "@/components/Rich";
// Connect owns the violet accent; candidate dots borrow mastered green (they're
// the learner's already-owned nodes), and the confirmed-link check reads green.
const VIOLET = CONNECT_COLOR.accent;
const GREEN = STATE_COLOR.mastered;

const STRINGS = {
  en: {
    map: "← Map",
    sessionConnect: "Session · Connect",
    kickerElaboration: "Elaboration · durable encoding through real connections",
    heading: "Wire this into what you already know.",
    intro1: "Understanding isn’t storage — you lock a concept in by tying it to things you already own. These are real nodes from ",
    introEm: "your",
    intro2: " map, not generic trivia. Confirm the links that are true, in your own words.",
    conceptWeb: "Concept web · drawn from your mastered nodes",
    rawMaterial: "Raw material for Retain",
    noCardsYet: "no cards yet",
    cardsDrafted: (n: number) =>
      `${n} ${n === 1 ? "card" : "cards"} drafted, atomically`,
    mnemonicCard: "mnemonic card",
    connectionCard: "connection card",
    emptyCards: "Confirm a link above and its card drafts itself here.",
    ctaFinish: "Connected · continue to Crucible →",
    readyNote: "Understood and connected — but not Mastered until the Crucible proves transfer.",
    notReadyNote: (linked: number, total: number) =>
      `${linked} of ${total} links made · two real connections is plenty to move on.`,
    linkingPrompt: "Linking prompt",
    howDoes: (center: string, cand: string) => `How does ${center} relate to ${cand}?`,
    describeRelationship: "Describe the real relationship in your own words — a draft is pulled from your map to accept or rewrite.",
    connectionPlaceholder: "Your connection…",
    linkConfirmedUpdate: "Link confirmed · update",
    confirmThisLink: "Confirm this link →",
    pickConcept: "Pick a concept to link",
    idleBody: "Tap any node in the web on the left. Each real link you confirm becomes a card in the Retain phase — the tedious step, done for you.",
    listLike: "list-like",
    conceptual: "conceptual",
    encodingAuto: "encoding method · auto-detected",
    mnemonicHidden: "Memory-palace & acronym tools stay hidden unless a node is genuinely list-like — sequences, taxonomies, raw vocab.",
    accepted: "Accepted · saved as a card",
    acceptThisAid: "Accept this aid →",
  },
  "pt-BR": {
    map: "← Mapa",
    sessionConnect: "Sessão · Connect",
    kickerElaboration: "Elaboração · codificação duradoura por conexões reais",
    heading: "Conecte isso ao que você já sabe.",
    intro1: "Compreender não é armazenar — você fixa um conceito ao amarrá-lo a coisas que você já domina. Estes são nós reais do ",
    introEm: "seu",
    intro2: " mapa, não trivialidades genéricas. Confirme os vínculos que forem verdadeiros, com suas próprias palavras.",
    conceptWeb: "Rede de conceitos · construída a partir dos seus nós dominados",
    rawMaterial: "Matéria-prima para o Retain",
    noCardsYet: "nenhum card ainda",
    cardsDrafted: (n: number) =>
      `${n} ${n === 1 ? "card rascunhado" : "cards rascunhados"}, atomicamente`,
    mnemonicCard: "card mnemônico",
    connectionCard: "card de conexão",
    emptyCards: "Confirme um vínculo acima e o card se rascunha sozinho aqui.",
    ctaFinish: "Conectado · continuar para o Crucible →",
    readyNote: "Compreendido e conectado — mas não Dominado até o Crucible provar a transferência.",
    notReadyNote: (linked: number, total: number) =>
      `${linked} de ${total} vínculos feitos · duas conexões reais já bastam para seguir em frente.`,
    linkingPrompt: "Prompt de vínculo",
    howDoes: (center: string, cand: string) => `Como ${center} se relaciona com ${cand}?`,
    describeRelationship: "Descreva a relação real com suas próprias palavras — um rascunho é puxado do seu mapa para aceitar ou reescrever.",
    connectionPlaceholder: "Sua conexão…",
    linkConfirmedUpdate: "Vínculo confirmado · atualizar",
    confirmThisLink: "Confirmar este vínculo →",
    pickConcept: "Escolha um conceito para vincular",
    idleBody: "Toque em qualquer nó da rede à esquerda. Cada vínculo real que você confirmar vira um card na fase Retain — a parte chata, já feita para você.",
    listLike: "tipo lista",
    conceptual: "conceitual",
    encodingAuto: "método de codificação · detectado automaticamente",
    mnemonicHidden: "As ferramentas de palácio da memória e acrônimos ficam escondidas a menos que um nó seja genuinamente do tipo lista — sequências, taxonomias, vocabulário puro.",
    accepted: "Aceito · salvo como card",
    acceptThisAid: "Aceitar este recurso →",
  },
} as const;

interface ConnectViewProps {
  /** The elaboration content for this node (concept web, links, mnemonics). */
  content: ElaborationContent;
  session: ConnectSession;
  onExit: () => void;
  /** Open a candidate's linking prompt. */
  onSelect: (id: string) => void;
  /** Edit the open link's relationship draft. */
  onDraft: (id: string, value: string) => void;
  /** Confirm the open link as true — it drafts a card. */
  onConfirm: (id: string) => void;
  /** Pick a memory aid (list-like content only). */
  onPickMnemonic: (index: number) => void;
  /** Edit the chosen aid before accepting it. */
  onDraftMnemonic: (value: string) => void;
  /** Accept the aid — it drafts its own card. */
  onAcceptMnemonic: () => void;
  /** Advance to the Crucible — understood and connected, not yet Mastered. */
  onFinish: () => void;
}

export default function ConnectView({
  content,
  session,
  onExit,
  onSelect,
  onDraft,
  onConfirm,
  onPickMnemonic,
  onDraftMnemonic,
  onAcceptMnemonic,
  onFinish,
}: ConnectViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const activeCand = session.active
    ? content.cands.find((c) => c.id === session.active) ?? null
    : null;
  const linkedCount = connectLinkedCount(session);
  const ready = connectReady(session, content.cands.length);
  const cards = connectCards(session, content, language);
  const cx = content.center.x;
  const cy = content.center.y;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.sans,
        fontSize: 15,
        zIndex: 30,
        animation: "softIn 0.3s both",
      }}
    >
      {/* Header — ← Map · Session · Connect · title · phase breadcrumb */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 58,
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {t.map}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: VIOLET,
          }}
        >
          {t.sessionConnect}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>
          <Rich text={content.centerLabel} />
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkGhost }}
        >
          Consume → Socratic → Feynman →{" "}
          <b style={{ color: VIOLET }}>Connect</b> → Crucible → Retain
        </span>
      </div>

      {/* Body — scrolls; centered 1040 column */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 32px 110px" }}>
          <div style={{ ...kicker(11), marginBottom: 10 }}>
            {t.kickerElaboration}
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.12,
              margin: "0 0 10px",
            }}
          >
            {t.heading}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: color.inkMuted,
              margin: "0 0 34px",
              maxWidth: 660,
              lineHeight: 1.55,
            }}
          >
            {t.intro1}
            <em>{t.introEm}</em>
            {t.intro2}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "580px 1fr",
              gap: 32,
              alignItems: "start",
              marginBottom: 34,
            }}
          >
            {/* Concept web */}
            <div>
              <div style={{ ...kicker(10), marginBottom: 12 }}>
                {t.conceptWeb}
              </div>
              <ConceptWeb
                content={content}
                session={session}
                cx={cx}
                cy={cy}
                onSelect={onSelect}
              />
            </div>

            {/* Linking prompt + auto-detected encoding method */}
            <div style={{ alignSelf: "stretch" }}>
              {activeCand ? (
                <LinkingPrompt
                  center={content.centerLabel}
                  cand={activeCand}
                  draft={session.drafts[activeCand.id] ?? ""}
                  linked={!!session.linked[activeCand.id]}
                  onDraft={onDraft}
                  onConfirm={onConfirm}
                />
              ) : (
                <IdlePrompt />
              )}

              <EncodingMethod
                content={content}
                session={session}
                onPickMnemonic={onPickMnemonic}
                onDraftMnemonic={onDraftMnemonic}
                onAcceptMnemonic={onAcceptMnemonic}
              />
            </div>
          </div>

          {/* Cards write-back — raw material for Retain */}
          <div
            style={{
              borderTop: `1px solid ${color.hairline}`,
              paddingTop: 26,
              marginBottom: 30,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <span style={kicker(10)}>{t.rawMaterial}</span>
              <span style={{ fontSize: 13.5, color: color.inkMuted }}>
                {cards.length === 0 ? t.noCardsYet : t.cardsDrafted(cards.length)}
              </span>
            </div>
            {cards.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 12,
                }}
              >
                {cards.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: color.card,
                      border: `1px solid ${color.hairlineStrong}`,
                      borderRadius: 12,
                      padding: "15px 17px",
                      animation: "fadeUp .3s both",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: VIOLET,
                        marginBottom: 8,
                      }}
                    >
                      {c.kind === "mnemonic" ? t.mnemonicCard : t.connectionCard}
                    </div>
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 16,
                        lineHeight: 1.35,
                        marginBottom: 9,
                        color: color.ink,
                      }}
                    >
                      <Rich text={c.front} />
                    </div>
                    <div
                      style={{
                        borderTop: `1px dashed ${color.hairlineStrong}`,
                        paddingTop: 9,
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        color: color.inkSoft,
                      }}
                    >
                      <Rich text={c.back} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{ fontSize: 14, color: color.inkGhost, fontStyle: "italic" }}
              >
                {t.emptyCards}
              </div>
            )}
          </div>

          {/* CTA — advance to the Crucible */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={onFinish}
              disabled={!ready}
              style={{
                padding: "15px 26px",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: ready ? "pointer" : "default",
                border: "none",
                background: ready ? color.accent : "rgba(44,40,35,0.08)",
                color: ready ? color.accentInk : color.inkGhost,
                boxShadow: ready ? "0 8px 22px rgba(47,107,79,0.26)" : "none",
              }}
            >
              {t.ctaFinish}
            </button>
            <span style={{ fontSize: 13.5, color: color.inkFaint, lineHeight: 1.45 }}>
              {ready ? t.readyNote : t.notReadyNote(linkedCount, content.cands.length)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The concept web: the current node centered, candidate prior nodes around it,
 *  edges solid-violet when linked and dashed-grey when still just candidates. */
function ConceptWeb({
  content,
  session,
  cx,
  cy,
  onSelect,
}: {
  content: ElaborationContent;
  session: ConnectSession;
  cx: number;
  cy: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 560,
        height: 440,
        background: color.card,
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        width={560}
        height={440}
      >
        {content.cands.map((c) => {
          const on = !!session.linked[c.id];
          return (
            <line
              key={c.id}
              x1={cx}
              y1={cy}
              x2={c.x}
              y2={c.y}
              stroke={on ? VIOLET : "rgba(44,40,35,0.2)"}
              strokeWidth={on ? 2.2 : 1.2}
              strokeDasharray={on ? "0" : "5 6"}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* Center — the node being connected */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          transform: "translate(-50%,-50%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          background: CONNECT_COLOR.soft,
          border: `1.5px solid ${VIOLET}`,
          borderRadius: 12,
          whiteSpace: "nowrap",
          fontFamily: font.serif,
          fontSize: 16,
          color: color.ink,
          boxShadow: `0 6px 22px ${CONNECT_COLOR.glow}`,
          zIndex: 4,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: VIOLET,
            flex: "0 0 auto",
          }}
        />
        <span>{content.centerLabel}</span>
      </div>

      {/* Candidate chips */}
      {content.cands.map((c) => {
        const on = !!session.linked[c.id];
        const active = session.active === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            aria-pressed={on}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              transform: "translate(-50%,-50%)",
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 12px",
              background: color.card,
              border: `1px solid ${
                active
                  ? VIOLET
                  : on
                    ? "rgba(76,139,99,0.55)"
                    : color.hairlineStrong
              }`,
              borderRadius: 10,
              whiteSpace: "nowrap",
              cursor: "pointer",
              userSelect: "none",
              fontFamily: font.serif,
              fontSize: 14,
              color: color.ink,
              boxShadow: active
                ? `0 8px 20px ${CONNECT_COLOR.glow}`
                : "0 2px 7px rgba(44,40,35,0.06)",
              transition: "border-color .18s, box-shadow .18s",
              zIndex: 3,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: GREEN,
                flex: "0 0 auto",
              }}
            />
            <span>{c.label}</span>
            {on && (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: VIOLET,
                  color: color.accentInk,
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The open linking prompt for one candidate — the editable relationship draft. */
function LinkingPrompt({
  center,
  cand,
  draft,
  linked,
  onDraft,
  onConfirm,
}: {
  center: string;
  cand: ElaborationLink;
  draft: string;
  linked: boolean;
  onDraft: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
}) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        background: color.card,
        border: `1px solid ${CONNECT_COLOR.border}`,
        borderRadius: 14,
        padding: "22px 22px 20px",
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: VIOLET,
          marginBottom: 12,
        }}
      >
        {t.linkingPrompt}
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 22,
          lineHeight: 1.28,
          marginBottom: 8,
        }}
      >
        {t.howDoes(center, cand.label)}
      </div>
      <div
        style={{
          fontSize: 13,
          color: color.inkFaint,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        {t.describeRelationship}
      </div>
      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 11,
          padding: 5,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => onDraft(cand.id, e.target.value)}
          placeholder={t.connectionPlaceholder}
          style={{
            width: "100%",
            // The seeded draft is a full sentence or two; a fixed box clipped it
            // mid-word, so the learner accepted words they couldn't read.
            fieldSizing: "content",
            minHeight: 120,
            resize: "vertical",
            border: "none",
            background: "transparent",
            fontFamily: font.serif,
            fontSize: 16,
            lineHeight: 1.55,
            color: color.ink,
            padding: "12px 13px",
          }}
        />
      </div>
      <MicButton
        value={draft}
        onChange={(next) => onDraft(cand.id, next)}
        accent={VIOLET}
      />
      <button
        onClick={() => onConfirm(cand.id)}
        style={{
          marginTop: 14,
          width: "100%",
          padding: 13,
          borderRadius: 11,
          fontSize: 14.5,
          fontWeight: 600,
          cursor: "pointer",
          background: linked ? CONNECT_COLOR.soft : VIOLET,
          color: linked ? VIOLET : color.accentInk,
          border: linked ? `1px solid ${CONNECT_COLOR.border}` : "none",
          boxShadow: linked ? "none" : `0 8px 20px ${CONNECT_COLOR.glow}`,
        }}
      >
        {linked ? t.linkConfirmedUpdate : t.confirmThisLink}
      </button>
    </div>
  );
}

/** The idle state — before any candidate is picked. */
function IdlePrompt() {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        border: `1px dashed ${color.hairlineStrong}`,
        borderRadius: 14,
        padding: "40px 28px",
        textAlign: "center",
        color: color.inkFaint,
      }}
    >
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 20,
          color: color.inkSoft,
          marginBottom: 8,
        }}
      >
        {t.pickConcept}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55 }}>
        {t.idleBody}
      </div>
    </div>
  );
}

/**
 * The auto-detected encoding method. Conceptual material shows the mnemonic
 * tools struck through (a mnemonic there is noise); list-like material offers
 * method-of-loci / acronym / vivid-image aids the learner can accept or edit.
 */
function EncodingMethod({
  content,
  session,
  onPickMnemonic,
  onDraftMnemonic,
  onAcceptMnemonic,
}: {
  content: ElaborationContent;
  session: ConnectSession;
  onPickMnemonic: (index: number) => void;
  onDraftMnemonic: (value: string) => void;
  onAcceptMnemonic: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const listLike = content.encoding === "list-like";
  return (
    <div
      style={{
        marginTop: 16,
        background: color.cardAlt,
        border: `1px solid ${color.hairline}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: VIOLET,
            border: `1px solid ${CONNECT_COLOR.border}`,
            borderRadius: 6,
            padding: "2px 7px",
          }}
        >
          {listLike ? t.listLike : t.conceptual}
        </span>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: color.inkFaint,
          }}
        >
          {t.encodingAuto}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: color.inkSoft,
          marginBottom: 12,
        }}
      >
        <Rich text={content.detectNote} />
      </div>

      {listLike ? (
        <MnemonicTool
          content={content}
          session={session}
          onPickMnemonic={onPickMnemonic}
          onDraftMnemonic={onDraftMnemonic}
          onAcceptMnemonic={onAcceptMnemonic}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {mnemonicToolsOff(language).map((m) => (
              <span
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: color.inkGhost,
                  background: color.chipBg,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: 8,
                  padding: "5px 10px",
                  textDecoration: "line-through",
                }}
              >
                <Rich text={m} />
              </span>
            ))}
          </div>
          <div
            style={{
              marginTop: 11,
              fontSize: 12.5,
              color: color.inkFaint,
              lineHeight: 1.5,
            }}
          >
            {t.mnemonicHidden}
          </div>
        </>
      )}
    </div>
  );
}

/** The active mnemonic tool — the ordered items, aid options, and accept/edit. */
function MnemonicTool({
  content,
  session,
  onPickMnemonic,
  onDraftMnemonic,
  onAcceptMnemonic,
}: {
  content: ElaborationContent;
  session: ConnectSession;
  onPickMnemonic: (index: number) => void;
  onDraftMnemonic: (value: string) => void;
  onAcceptMnemonic: () => void;
}) {
  const t = useT(STRINGS);
  const options = content.mnemonics ?? [];
  const picked = session.mnemonicPick;

  return (
    <div>
      {/* The sequence the aid organizes */}
      {content.items && content.items.length > 0 && (
        <ol
          style={{
            margin: "0 0 14px",
            padding: 0,
            listStyle: "none",
            counterReset: "step",
          }}
        >
          {content.items.map((it, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 9,
                alignItems: "baseline",
                fontSize: 13,
                lineHeight: 1.5,
                color: color.inkSoft,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: VIOLET,
                  flex: "0 0 auto",
                }}
              >
                {i + 1}.
              </span>
              <span>{it}</span>
            </div>
          ))}
        </ol>
      )}

      {/* Aid options — pick one to draft */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {options.map((opt, i) => {
          const active = picked === i;
          return (
            <button
              key={i}
              onClick={() => onPickMnemonic(i)}
              aria-pressed={active}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                textAlign: "left",
                padding: "8px 12px",
                borderRadius: 9,
                cursor: "pointer",
                fontFamily: "inherit",
                background: active ? CONNECT_COLOR.soft : color.card,
                border: `1px solid ${active ? VIOLET : color.hairlineStrong}`,
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: active ? VIOLET : color.inkFaint,
                }}
              >
                {opt.kind}
              </span>
              <span style={{ fontSize: 13.5, color: color.ink }}>{opt.title}</span>
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div style={{ animation: "fadeUp .25s both" }}>
          <div
            style={{
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 11,
              padding: 5,
            }}
          >
            <textarea
              value={session.mnemonicDraft}
              onChange={(e) => onDraftMnemonic(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                resize: "vertical",
                border: "none",
                background: "transparent",
                fontFamily: font.serif,
                fontSize: 14.5,
                lineHeight: 1.5,
                color: color.ink,
                padding: "10px 12px",
              }}
            />
          </div>
          <MicButton
            value={session.mnemonicDraft}
            onChange={onDraftMnemonic}
            accent={VIOLET}
          />
          <button
            onClick={onAcceptMnemonic}
            style={{
              marginTop: 10,
              padding: "10px 15px",
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
              background: session.mnemonicAccepted ? CONNECT_COLOR.soft : VIOLET,
              color: session.mnemonicAccepted ? VIOLET : color.accentInk,
              border: session.mnemonicAccepted
                ? `1px solid ${CONNECT_COLOR.border}`
                : "none",
            }}
          >
            {session.mnemonicAccepted ? t.accepted : t.acceptThisAid}
          </button>
        </div>
      )}
    </div>
  );
}
