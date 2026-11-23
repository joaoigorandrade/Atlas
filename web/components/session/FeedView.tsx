"use client";

// The Frontier Feed sheet: a round of pretest cards dealt from the next few
// readings, each answer bet in ink, then a closing tally that sends each miss to
// its reading. Presentational — the round lives in `useFeed`, and every answer
// in the `ConsumeProgress` of the reading it came from.

import type { ConceptNode } from "@/lib/curriculum";
import { FEED_SIZE, inkDelta } from "@/lib/curriculum";
import type { FeedState } from "@/components/atlas/useFeed";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";
import Button from "@/components/ui/Button";
import Plate from "@/components/ui/Plate";
import Rich from "@/components/Rich";
import { SectionCheck } from "@/components/session/consume/SectionCheck";
import {
  BLUE,
  RIGHT,
  STRINGS as CONSUME,
  WRONG,
} from "@/components/session/consume/shared";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    back: "← Map",
    kicker: "Frontier feed",
    ink: (n: number) => `${n} ink`,
    progress: (a: number, n: number) => `card ${a} of up to ${n}`,
    knownTitle: "You already had this",
    knownBody: "That section is folded to its takeaway in the reading.",
    missedTitle: "Not this time",
    missedBody:
      "The answer is in the reading: the section opens in full, with this question waiting at its end.",
    next: "Next card →",
    readNow: "Read it now →",
    doneKicker: "Round complete",
    doneTitle: (n: number) => `${n} card${n === 1 ? "" : "s"} answered`,
    doneInk: (d: number) => (d < 0 ? `−${-d} ink this round` : `+${d} ink this round`),
    toRead: "Read next",
    read: "Read →",
    allLanded: "Every card landed — nothing owed from this round.",
    emptyTitle: "Nothing to deal yet",
    emptyBody:
      "The next readings are still being written, or every section in them has been asked. Come back after the next one opens.",
    backToMap: "Back to the map",
  },
  "pt-BR": {
    back: "← Mapa",
    kicker: "Feed da fronteira",
    ink: (n: number) => `${n} de tinta`,
    progress: (a: number, n: number) => `carta ${a} de até ${n}`,
    knownTitle: "Você já sabia isto",
    knownBody: "Essa seção fica recolhida na ideia central dentro da leitura.",
    missedTitle: "Desta vez não",
    missedBody:
      "A resposta está na leitura: a seção abre por inteiro, com esta pergunta esperando no final.",
    next: "Próxima carta →",
    readNow: "Ler agora →",
    doneKicker: "Rodada concluída",
    doneTitle: (n: number) =>
      `${n} ${n === 1 ? "carta respondida" : "cartas respondidas"}`,
    doneInk: (d: number) =>
      d < 0 ? `−${-d} de tinta nesta rodada` : `+${d} de tinta nesta rodada`,
    toRead: "Ler em seguida",
    read: "Ler →",
    allLanded: "Todas as cartas acertaram — nada pendente desta rodada.",
    emptyTitle: "Nada para distribuir ainda",
    emptyBody:
      "As próximas leituras ainda estão sendo escritas, ou todas as seções delas já foram perguntadas. Volte quando a próxima abrir.",
    backToMap: "Voltar ao mapa",
  },
} as const;

const title = { fontFamily: font.display, fontWeight: 400, lineHeight: 1.15 } as const;

export default function FeedView({
  feed,
  topic,
  onRead,
}: {
  feed: FeedState;
  topic: string;
  /** Open this concept's reading — where a missed card's answer is. */
  onRead: (node: ConceptNode) => void;
}) {
  const t = useT(STRINGS);
  const c = useT(CONSUME);
  const { round, card, ink, graph } = feed;
  const nodeOf = (id: string) => graph.nodes.find((n) => n.id === id);
  const labelOf = (id: string) => nodeOf(id)?.label ?? id;
  const read = (id: string) => {
    const node = nodeOf(id);
    if (node) onRead(node);
  };
  const last = round?.last;
  const answered = round?.answered ?? 0;

  return (
    <Sheet data-testid="screen-feed" aria-label={t.kicker}>
      <Masthead
        back={t.back}
        onBack={feed.close}
        backTestId="action-exit"
        kicker={t.kicker}
        accent={BLUE}
        title={topic}
        meta={
          <span data-testid="feed-ink" style={{ fontFamily: font.caps, fontSize: 15 }}>
            {t.ink(ink)}
          </span>
        }
      />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px 120px" }}>
          {card && !last && (
            <div
              key={`${card.nodeId}:${card.chunk.id}`}
              style={{ animation: "fadeUp .4s both" }}
            >
              <div style={{ ...kicker(10, "0.12em"), marginBottom: 8 }}>
                {t.progress(answered + 1, FEED_SIZE)}
              </div>
              <div style={{ ...kicker(11, "0.12em", BLUE) }}>{labelOf(card.nodeId)}</div>
              <h2 style={{ ...title, fontSize: 28, margin: "6px 0 0" }}>
                {card.chunk.kicker}
              </h2>
              {card.chunk.check && (
                <SectionCheck
                  pretest
                  topic={topic}
                  nodeLabel={labelOf(card.nodeId)}
                  check={card.chunk.check}
                  onAnswer={(oi, correct, stake) =>
                    feed.answer(card.nodeId, card.chunk, oi, correct, stake)
                  }
                />
              )}
            </div>
          )}

          {last && (
            <Plate data-testid="feed-outcome" style={{ animation: "fadeUp .35s both" }}>
              <div style={kicker(10, "0.12em", last.correct ? RIGHT : WRONG)}>
                {labelOf(last.nodeId)} · {last.chunk.kicker}
              </div>
              <h2 style={{ ...title, fontSize: 30, margin: "8px 0 4px" }}>
                {last.correct ? t.knownTitle : t.missedTitle}
              </h2>
              <div
                data-testid="feed-ink-delta"
                style={{ fontFamily: font.caps, fontSize: 18, color: color.ink }}
              >
                {last.correct
                  ? c.inkWon(inkDelta(last.stake, true))
                  : c.inkLost(-inkDelta(last.stake, false))}
              </div>
              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: color.inkSoft,
                  marginTop: 12,
                }}
              >
                {last.correct ? (
                  // The reason, so a lucky guess still leaves with it.
                  <Rich text={last.chunk.check?.right ?? t.knownBody} />
                ) : (
                  t.missedBody
                )}
              </div>
              {!last.correct && last.stake === 2 && (
                <div style={{ fontSize: 15, color: color.ink, marginTop: 10 }}>
                  {c.confidentMiss}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <Button data-testid="action-feed-next" accent={BLUE} onClick={feed.next}>
                  {t.next}
                </Button>
                {!last.correct && (
                  <Button
                    variant="secondary"
                    accent={BLUE}
                    data-testid="action-feed-read"
                    onClick={() => read(last.nodeId)}
                  >
                    {t.readNow}
                  </Button>
                )}
              </div>
            </Plate>
          )}

          {!card && !last && (
            <div data-testid="feed-done" style={{ animation: "fadeUp .4s both" }}>
              <div style={kicker(10, "0.12em", BLUE)}>
                {answered ? t.doneKicker : t.emptyTitle}
              </div>
              {answered > 0 ? (
                <>
                  <h2 style={{ ...title, fontSize: 34, margin: "8px 0 4px" }}>
                    {t.doneTitle(answered)}
                  </h2>
                  <div style={{ fontFamily: font.caps, fontSize: 18 }}>
                    {t.doneInk(ink - (round?.inkAt ?? ink))}
                  </div>
                  <div style={{ marginTop: 24, fontSize: 15, color: color.inkSoft }}>
                    {round?.missed.length ? t.toRead : t.allLanded}
                  </div>
                  {round?.missed.map((id) => (
                    <button
                      key={id}
                      className="at-press"
                      data-testid={`action-feed-read-${id}`}
                      onClick={() => read(id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        marginTop: 8,
                        padding: "12px 16px",
                        border: `1px solid ${color.hairlineStrong}`,
                        borderRadius: 3,
                        background: color.card,
                        fontFamily: font.serif,
                        fontSize: 16,
                        color: color.ink,
                        cursor: "pointer",
                      }}
                    >
                      <span>{labelOf(id)}</span>
                      <span style={{ color: BLUE }}>{t.read}</span>
                    </button>
                  ))}
                </>
              ) : (
                <p style={{ fontSize: 15, color: color.inkSoft }}>{t.emptyBody}</p>
              )}
              <div style={{ marginTop: 24 }}>
                <Button variant="secondary" accent={BLUE} onClick={feed.close}>
                  {t.backToMap}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
