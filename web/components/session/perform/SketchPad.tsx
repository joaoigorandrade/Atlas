"use client";

// A sheet to draw the run on — a diagram, a construction, boxes and arrows.
// What it emits is a PNG the checker reads beside the written work, so it is
// always the light paper with dark ink, whatever the theme: a dark-mode
// transparent PNG reads as black on black to a model.
//
// ponytail: one pen, one colour, no eraser beyond Undo/Clear. Add tools when
// a learner asks for them.

import { useEffect, useRef } from "react";
import { color, raw } from "@/lib/theme";

const PAPER = raw("light").card;
const INK = raw("light").ink;
const HEIGHT = 360;

const tool = {
  padding: "7px 12px",
  background: color.card,
  border: `1px solid ${color.hairlineStrong}`,
  borderRadius: 3,
  fontSize: 12.5,
  color: color.inkMuted,
  cursor: "pointer",
} as const;

export default function SketchPad({
  value,
  onChange,
  disabled,
  labels,
}: {
  value: string | undefined;
  onChange: (png: string | undefined) => void;
  disabled?: boolean;
  labels: { undo: string; clear: string };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Each finished stroke's image before it — Undo pops one. Starts from what
  // was already drawn, so a remount (tab switch, fix) can still undo.
  const history = useRef<(string | undefined)[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => canvas.current?.getContext("2d") ?? null;

  const paint = (png: string | undefined) => {
    const el = canvas.current;
    const c = ctx();
    if (!el || !c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, el.width, el.height);
    const dpr = el.width / el.clientWidth || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!png) return;
    const img = new Image();
    img.onload = () => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(img, 0, 0, el.width, el.height);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    img.src = png;
  };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(el.clientWidth * dpr);
    el.height = Math.round(HEIGHT * dpr);
    paint(value);
    // Mount only: afterwards the canvas is the source and `value` its echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    history.current.push(value);
    last.current = point(e);
    move(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    const from = last.current;
    if (!c || !from) return;
    const to = point(e);
    // A pen reports pressure; a mouse reports 0.5 while pressed.
    const p = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    c.strokeStyle = INK;
    c.lineCap = c.lineJoin = "round";
    c.lineWidth = 1 + p * 3;
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x + 0.01, to.y);
    c.stroke();
    last.current = to;
  };

  const up = () => {
    if (!last.current) return;
    last.current = null;
    onChange(canvas.current!.toDataURL("image/png"));
  };

  const undo = () => {
    if (!history.current.length) return;
    const prev = history.current.pop();
    paint(prev);
    onChange(prev);
  };

  const clear = () => {
    history.current.push(value);
    paint(undefined);
    onChange(undefined);
  };

  return (
    <div>
      <canvas
        ref={canvas}
        data-testid="perform-sketch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          display: "block",
          width: "100%",
          height: HEIGHT,
          borderRadius: 3,
          border: `1px solid ${color.hairlineStrong}`,
          background: PAPER,
          touchAction: "none",
          cursor: disabled ? "default" : "crosshair",
          opacity: disabled ? 0.6 : 1,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          className="at-press"
          onClick={undo}
          disabled={disabled || !history.current.length}
          style={tool}
        >
          {labels.undo}
        </button>
        <button
          className="at-press"
          data-testid="sketch-clear"
          onClick={clear}
          disabled={disabled || !value}
          style={tool}
        >
          {labels.clear}
        </button>
      </div>
    </div>
  );
}
