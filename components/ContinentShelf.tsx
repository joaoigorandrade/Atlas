"use client";

// The dashboard's continents: one card per group of maps that belong
// together, above the loose maps, and the way to found a new one — a name and
// the maps it gathers. A map in a continent is reached through its continent,
// so the "Your maps" grid leaves it out.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { plateStyle } from "@/components/ui/Plate";
import type { Continents } from "@/components/atlas/useContinents";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    title: "Your continents",
    found: "+ New continent",
    kicker: "Continent",
    maps: (n: number) => (n === 1 ? "1 map" : `${n} maps`),
    uncharted: (n: number) => (n === 1 ? "1 uncharted" : `${n} uncharted`),
    name: "Name the continent",
    namePlaceholder: "e.g. Mathematics for machine learning",
    pick: "Gather at least two of your maps:",
    tooFew: "A continent needs at least two maps that aren't in one already.",
    create: "Found it",
    cancel: "Cancel",
  },
  "pt-BR": {
    title: "Seus continentes",
    found: "+ Novo continente",
    kicker: "Continente",
    maps: (n: number) => (n === 1 ? "1 mapa" : `${n} mapas`),
    uncharted: (n: number) => (n === 1 ? "1 inexplorado" : `${n} inexplorados`),
    name: "Dê um nome ao continente",
    namePlaceholder: "ex.: Matemática para aprendizado de máquina",
    pick: "Reúna pelo menos dois dos seus mapas:",
    tooFew: "Um continente precisa de pelo menos dois mapas que ainda não estejam em um.",
    create: "Fundar",
    cancel: "Cancelar",
  },
} as const;

const linkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13.5,
  fontFamily: font.sans,
  color: color.accent,
  cursor: "pointer",
} as const;

export default function ContinentShelf({ continents }: { continents: Continents }) {
  const t = useT(STRINGS);
  const { continents: list, loose, busy } = continents;
  const [founding, setFounding] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const close = () => {
    setFounding(false);
    setName("");
    setPicked([]);
  };
  const ready = name.trim() && picked.length >= 2 && !busy;
  // Nothing to show and nothing to found: a learner with one map has no use for it.
  if (!list.length && loose.length < 2) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: font.serif, fontSize: 22 }}>{t.title}</div>
        {!founding && (
          <button
            className="at-press"
            data-testid="action-new-continent"
            onClick={() => setFounding(true)}
            style={linkStyle}
          >
            {t.found}
          </button>
        )}
      </div>

      {founding && (
        <div style={{ ...plateStyle, padding: "20px 22px", marginBottom: 16 }}>
          {loose.length < 2 ? (
            <div style={{ fontSize: 14, color: color.inkMuted, marginBottom: 12 }}>
              {t.tooFew}
            </div>
          ) : (
            <>
              <label style={{ ...kicker(11), display: "block", marginBottom: 8 }}>
                {t.name}
              </label>
              <input
                autoFocus
                value={name}
                placeholder={t.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: font.serif,
                  fontSize: 18,
                  padding: "6px 0",
                  background: "transparent",
                  color: color.ink,
                  border: "none",
                  borderBottom: `1px solid ${color.rule}`,
                  outline: "none",
                  marginBottom: 16,
                }}
              />
              <div style={{ fontSize: 13.5, color: color.inkMuted, marginBottom: 8 }}>
                {t.pick}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "6px 16px",
                  marginBottom: 16,
                }}
              >
                {loose.map((m) => (
                  <label
                    key={m.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 15,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(m.id)}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id),
                        )
                      }
                    />
                    {m.subject}
                  </label>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {loose.length >= 2 && (
              <Button
                full={false}
                data-testid="action-found-continent"
                disabled={!ready}
                onClick={() => {
                  continents.create(name.trim(), picked);
                  close();
                }}
              >
                {t.create}
              </Button>
            )}
            <Button variant="quiet" onClick={close}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {list.map((c) => (
            <button
              key={c.id}
              className="at-lift"
              data-testid="action-open-continent"
              data-continent={c.name}
              onClick={() => continents.openContinent(c.id)}
              style={{
                ...plateStyle,
                padding: "22px 22px 20px",
                cursor: "pointer",
                textAlign: "left",
                font: "inherit",
                color: color.ink,
              }}
            >
              <div style={{ ...kicker(10, "0.1em"), marginBottom: 10 }}>{t.kicker}</div>
              <div
                style={{
                  fontFamily: font.display,
                  fontSize: 21,
                  lineHeight: 1.15,
                  marginBottom: 8,
                }}
              >
                {c.name}
              </div>
              <div style={{ fontSize: 13, color: color.inkMuted, lineHeight: 1.5 }}>
                {c.members.map((m) => m.subject).join(" · ")}
              </div>
              <div style={{ fontSize: 12.5, color: color.inkFaint, marginTop: 10 }}>
                {t.maps(c.members.length)}
                {c.uncharted.length > 0 && ` · ${t.uncharted(c.uncharted.length)}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
