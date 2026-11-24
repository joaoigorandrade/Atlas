import { color, font } from "@/lib/theme";

/** "⌘↵ to submit" — `.at-kbd-hint` hides it on a touchscreen, which has no ⌘. */
export default function KbdHint({ children }: { children: string }) {
  return (
    <span
      className="at-kbd-hint"
      style={{ fontFamily: font.mono, fontSize: 10.5, color: color.inkGhost }}
    >
      {children}
    </span>
  );
}
