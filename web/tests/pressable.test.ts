import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { pressable } from "@/components/ui/Button";

const key = (k: string, inner = false) => {
  const self = {};
  return {
    key: k,
    target: inner ? {} : self,
    currentTarget: self,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
};

describe("pressable", () => {
  it("opens on Enter and Space on the card itself", () => {
    const go = vi.fn();
    pressable(go).onKeyDown(key("Enter"));
    pressable(go).onKeyDown(key(" "));
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("leaves other keys, and keys on a control inside the card, alone", () => {
    // The map card holds its own × button: Enter there must not also open the map.
    const go = vi.fn();
    pressable(go).onKeyDown(key("Tab"));
    pressable(go).onKeyDown(key("Enter", true));
    expect(go).not.toHaveBeenCalled();
  });
});
