"use client";

// A continent: the learner's maps that belong together, drawn as one landmass.
// Each map is a country — its concepts are its territories, washed in as they
// are won — and each scope not yet charted is a patch of hatched terra
// incognita with its name on it. Pressing a country opens that map as it
// always opens; pressing unknown land charts it. The maps stay whole and
// separate underneath: this screen only draws them together.

import { useMemo, useRef, useState } from "react";
import Masthead from "@/components/ui/Masthead";
import Button from "@/components/ui/Button";
import { plateStyle } from "@/components/ui/Plate";
import { Land } from "@/components/map/MapTerrain";
import { continentAtlas, ownerOf } from "@/components/map/continentLayout";
import { mapBounds } from "@/components/map/mapGeometry";
import { useBox, type Territory } from "@/components/map/useMapPointer";
import type { Continents } from "@/components/atlas/useContinents";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    back: "Your atlas",
    kicker: "Continent",
    rename: "Rename",
    maps: "Its maps",
    mastered: (pct: number) => `${pct}% mastered`,
    leave: "Take out",
    uncharted: "Uncharted",
    chart: "Chart it",
    add: "Add a map",
    addNone: "Every map already belongs to a continent.",
    addPick: "Choose a map…",
    dissolve: "Dissolve continent",
    dissolveAsk: "Dissolve this continent? Its maps stay exactly as they are.",
    dissolveYes: "Dissolve",
    cancel: "Keep it",
    hint: "Press a country to open its map, or unknown land to chart it.",
  },
  "pt-BR": {
    back: "Seu atlas",
    kicker: "Continente",
    rename: "Renomear",
    maps: "Seus mapas",
    mastered: (pct: number) => `${pct}% dominado`,
    leave: "Tirar",
    uncharted: "Inexplorado",
    chart: "Mapear",
    add: "Adicionar um mapa",
    addNone: "Todos os mapas já pertencem a um continente.",
    addPick: "Escolha um mapa…",
    dissolve: "Desfazer continente",
    dissolveAsk: "Desfazer este continente? Os mapas continuam exatamente como estão.",
    dissolveYes: "Desfazer",
    cancel: "Manter",
    hint: "Toque num país para abrir o mapa, ou em terra desconhecida para mapeá-la.",
  },
} as const;

/** Map units of margin round the outermost concepts — the coast and its
 *  water lines reach this far past them. */
const PAD = 200;

export default function ContinentScreen({ continents }: { continents: Continents }) {
  const t = useT(STRINGS);
  const { open: c, loose, busy } = continents;
  const area = useRef<HTMLDivElement>(null);
  const territory = useRef<Territory | null>(null);
  const box = useBox(area);
  const [naming, setNaming] = useState<string | null>(null);
  const [dissolving, setDissolving] = useState(false);

  // Coarse on purpose: a resize of a few pixels must not repack and re-bake.
  const aspect = box.w && box.h ? Math.round((box.w / box.h) * 4) / 4 : 1.5;
  const input = useMemo(
    () => (c ? continentAtlas(c.members, c.uncharted, aspect) : null),
    [c, aspect],
  );
  const bounds = useMemo(
    () => (input ? mapBounds(input.positions, input.ids) : null),
    [input],
  );
  // Its own fit, not the map's `fitView`: that one never zooms out past the
  // map's floor, and a whole continent is meant to be seen at once.
  const view = (() => {
    if (!bounds || !box.w) return null;
    const w = bounds.maxX - bounds.minX + PAD * 2;
    const h = bounds.maxY - bounds.minY + PAD * 2;
    const scale = Math.min(box.w / w, box.h / h, 1.1);
    return {
      scale,
      x: box.w / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: box.h / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
    };
  })();

  if (!c) return null;

  const press = (e: React.MouseEvent) => {
    if (!view || !area.current) return;
    const r = area.current.getBoundingClientRect();
    const id = territory.current?.({
      x: (e.clientX - r.left - view.x) / view.scale,
      y: (e.clientY - r.top - view.y) / view.scale,
    });
    if (!id) return;
    const owner = ownerOf(id);
    if ("scope" in owner) continents.chart(c.id, owner.scope);
    else {
      const m = c.members.find((x) => x.id === owner.topicId);
      if (m) continents.enterMap(m.subject);
    }
  };

  const commitName = () => {
    const name = naming?.trim();
    setNaming(null);
    if (name && name !== c.name) continents.rename(c.id, name);
  };

  return (
    <div
      data-testid="screen-continent"
      className="at-paper"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Masthead
        back={`← ${t.back}`}
        onBack={continents.exit}
        backTestId="action-back-dashboard"
        kicker={t.kicker}
        title={
          naming === null ? (
            <button
              className="at-press"
              data-testid="action-rename-continent"
              aria-label={`${t.rename}: ${c.name}`}
              onClick={() => setNaming(c.name)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: color.ink,
                cursor: "text",
              }}
            >
              {c.name}
            </button>
          ) : (
            <input
              autoFocus
              aria-label={t.rename}
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setNaming(null);
              }}
              style={{
                font: "inherit",
                color: color.ink,
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${color.rule}`,
                outline: "none",
                width: 320,
              }}
            />
          )
        }
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div
          ref={area}
          onClick={press}
          style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "pointer" }}
        >
          {view && bounds && input && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transformOrigin: "0 0",
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
            >
              <Land {...input} bounds={bounds} frozen={false} territory={territory} />
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: 24,
              bottom: 20,
              fontStyle: "italic",
              fontSize: 13.5,
              color: color.inkMuted,
              pointerEvents: "none",
            }}
          >
            {t.hint}
          </div>
        </div>

        <aside
          style={{
            width: 320,
            flex: "0 0 auto",
            overflowY: "auto",
            padding: "22px 20px",
            borderLeft: `1px solid ${color.hairlineStrong}`,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ ...plateStyle, padding: "16px 18px" }}>
            <div style={{ ...kicker(11), marginBottom: 10 }}>{t.maps}</div>
            {c.members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "6px 0",
                }}
              >
                <button
                  className="at-press"
                  data-testid="action-open-map"
                  data-subject={m.subject}
                  onClick={() => continents.enterMap(m.subject)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: color.ink,
                    fontFamily: font.serif,
                    fontSize: 17,
                  }}
                >
                  {m.subject}
                  <span
                    style={{ display: "block", fontSize: 12.5, color: color.inkMuted }}
                  >
                    {t.mastered(m.masteryPct)}
                  </span>
                </button>
                <Button
                  variant="quiet"
                  data-testid="action-leave-continent"
                  disabled={busy}
                  onClick={() => continents.leave(m.id)}
                >
                  {t.leave}
                </Button>
              </div>
            ))}
          </div>

          {c.uncharted.length > 0 && (
            <div style={{ ...plateStyle, padding: "16px 18px" }}>
              <div style={{ ...kicker(11), marginBottom: 10 }}>{t.uncharted}</div>
              {c.uncharted.map((s) => (
                <div key={s.label} style={{ padding: "6px 0" }}>
                  <div style={{ fontFamily: font.serif, fontSize: 17 }}>{s.label}</div>
                  <div
                    style={{ fontSize: 12.5, color: color.inkMuted, margin: "2px 0 8px" }}
                  >
                    {s.note}
                  </div>
                  <Button
                    variant="secondary"
                    data-testid="action-chart-scope"
                    data-scope={s.label}
                    onClick={() => continents.chart(c.id, s.label)}
                  >
                    {t.chart}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...plateStyle, padding: "16px 18px" }}>
            <div style={{ ...kicker(11), marginBottom: 10 }}>{t.add}</div>
            {loose.length ? (
              <select
                data-testid="action-add-to-continent"
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && continents.join(c.id, e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: font.serif,
                  fontSize: 15,
                  padding: "6px 8px",
                  background: color.card,
                  color: color.ink,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 3,
                }}
              >
                <option value="">{t.addPick}</option>
                {loose.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.subject}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 13, color: color.inkMuted }}>{t.addNone}</div>
            )}
          </div>

          <div style={{ marginTop: "auto" }}>
            {dissolving ? (
              <div style={{ animation: "softIn .18s both" }}>
                <div style={{ fontSize: 13.5, color: color.inkMuted, marginBottom: 10 }}>
                  {t.dissolveAsk}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="secondary"
                    full={false}
                    accent={color.inkMuted}
                    disabled={busy}
                    data-testid="action-dissolve-confirm"
                    onClick={() => continents.dissolve(c.id)}
                  >
                    {t.dissolveYes}
                  </Button>
                  <Button variant="quiet" onClick={() => setDissolving(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="quiet"
                data-testid="action-dissolve-continent"
                onClick={() => setDissolving(true)}
              >
                {t.dissolve}
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
