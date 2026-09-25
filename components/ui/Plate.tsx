"use client";

import type { CSSProperties, HTMLAttributes } from "react";
import { color } from "@/lib/theme";

/** A plate's frame, for surfaces that can't be a `Plate` (a button, a link). */
export const plateStyle: CSSProperties = {
  background: color.card,
  border: `3px double ${color.rule}`,
  borderRadius: 2,
};

/**
 * A plate pasted onto the page: vellum inside an engraved double rule. What a
 * card is in the atlas. `deckle` tears its top and bottom edges.
 */
export default function Plate({
  deckle,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { deckle?: boolean }) {
  const cls = [deckle && "at-deckle", className].filter(Boolean).join(" ");
  return (
    <div
      className={cls || undefined}
      {...rest}
      style={{
        ...plateStyle,
        ...(deckle && { borderTop: "none", borderBottom: "none" }),
        padding: "20px 22px",
        ...style,
      }}
    />
  );
}
