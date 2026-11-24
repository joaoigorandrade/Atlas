"use client";

// The welcome screen's one field for *what*: the topic, and a source to ground
// it — dropped, pasted or browsed, in either mode (the map prompt reads the
// outline for a glance map too). Enter builds; Shift+Enter breaks the line.
// While the field is empty, a few starting points sit under it.

import { useRef, useState, type CSSProperties } from "react";
import type { OutlineUpload } from "@/components/atlas/outlineUpload";
import { InkDots } from "@/components/Pending";
import { color, font, kicker, alpha } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    placeholder: "A topic, a question, a thing you keep hearing about…",
    attach: "Add a source",
    attachHint: "PDF or outline — drop or paste it here",
    dropHere: "Drop it — the map will follow this source",
    replace: "replace",
    try: "Try",
    examples: [
      "How vaccines train the immune system",
      "Bayesian thinking",
      "The fall of the Roman Republic",
      "Music theory for guitarists",
    ],
  },
  "pt-BR": {
    placeholder: "Um tema, uma pergunta, algo de que você sempre ouve falar…",
    attach: "Adicionar fonte",
    attachHint: "PDF ou ementa — solte ou cole aqui",
    dropHere: "Solte — o mapa vai seguir essa fonte",
    replace: "trocar",
    try: "Experimente",
    examples: [
      "Como as vacinas treinam o sistema imune",
      "Pensamento bayesiano",
      "A queda da República Romana",
      "Teoria musical para violonistas",
    ],
  },
} as const;

const attachButton: CSSProperties = {
  background: "none",
  border: `1px solid ${color.hairlineStrong}`,
  borderRadius: 3,
  padding: "4px 10px",
  cursor: "pointer",
  fontFamily: font.sans,
  fontSize: 12.5,
  color: color.inkSoft,
};

const chip: CSSProperties = {
  background: color.chipBg,
  border: "none",
  borderRadius: 999,
  padding: "5px 12px",
  cursor: "pointer",
  fontFamily: font.serif,
  fontSize: 14,
  color: color.inkSoft,
};

export default function TopicComposer({
  label,
  topic,
  onTopic,
  upload,
}: {
  label: string;
  topic: string;
  onTopic: (topic: string) => void;
  upload: OutlineUpload;
}) {
  const t = useT(STRINGS);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadNote, onOutlineFile, outline } = upload;
  const busy = uploadNote !== null && outline === null;
  const browse = () => fileRef.current?.click();

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onOutlineFile(file);
        }}
        style={{
          position: "relative",
          background: color.card,
          border: `1px ${dragging ? "dashed" : "solid"} ${dragging ? color.accent : color.hairlineStrong}`,
          borderRadius: 3,
          boxShadow: "0 4px 18px rgba(var(--shade),.06)",
        }}
      >
        <textarea
          data-testid="field-topic"
          aria-label={label}
          autoFocus
          // The placeholder is three lines on a phone; two cut it mid-word.
          rows={3}
          enterKeyHint="go"
          value={topic}
          onChange={(e) => onTopic(e.target.value)}
          onPaste={(e) => {
            // A copied file pastes as a source; plain text still pastes as the topic.
            const file = e.clipboardData.files?.[0];
            if (!file) return;
            e.preventDefault();
            onOutlineFile(file);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }}
          placeholder={t.placeholder}
          style={{
            display: "block",
            width: "100%",
            border: "none",
            background: "transparent",
            resize: "none",
            outline: "none",
            fontFamily: font.serif,
            fontSize: "clamp(18px, 5vw, 22px)",
            lineHeight: 1.35,
            color: color.ink,
            padding: "16px 18px 10px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "9px 14px",
            borderTop: `1px solid ${color.hairline}`,
            fontSize: 13,
            color: color.inkFaint,
          }}
        >
          {uploadNote ? (
            <>
              <span
                data-testid="source-note"
                style={{
                  color: color.accent,
                  background: color.accentBg,
                  borderRadius: 3,
                  padding: "3px 9px",
                  animation: busy ? "breathe 2s ease-in-out infinite" : undefined,
                }}
              >
                {uploadNote}
              </span>
              {busy ? (
                <InkDots size={3.5} tone={color.accent} />
              ) : (
                <button
                  type="button"
                  className="at-press"
                  onClick={browse}
                  style={{ ...attachButton, border: "none", textDecoration: "underline" }}
                >
                  {t.replace}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="at-press"
                data-testid="action-attach-source"
                onClick={browse}
                style={attachButton}
              >
                + {t.attach}
              </button>
              <span>{t.attachHint}</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onOutlineFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {dragging && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: `${alpha(color.accentBg, 93)}`,
              color: color.accent,
              fontFamily: font.display,
              fontStyle: "italic",
              fontSize: 19,
              pointerEvents: "none",
            }}
          >
            {t.dropHere}
          </div>
        )}
      </div>

      {!topic.trim() && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
          }}
        >
          <span style={{ ...kicker(11, "0.16em"), marginRight: 2 }}>{t.try}</span>
          {t.examples.map((example) => (
            <button
              key={example}
              type="button"
              className="at-press"
              onClick={() => onTopic(example)}
              style={chip}
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
