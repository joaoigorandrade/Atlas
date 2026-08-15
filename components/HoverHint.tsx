"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { color, font, motion } from "@/lib/theme";
import { usePresence } from "@/lib/motion";

type Place = "top" | "bottom" | "right";

/**
 * A hover hint: the sentence that explains the control under the cursor.
 *
 * The app used to lean on the browser's `title` attribute for this, which
 * arrives after a second of stillness, in the OS's own type, and never on
 * keyboard focus. This is the same information as a first-class surface — it
 * dwells before it opens (so sweeping a cursor down a rail doesn't flash six
 * of them), it grows out of its anchor, and it leaves rather than vanishing.
 *
 * Focus opens it too, and the bubble is the control's `aria-describedby`, so
 * the hint belongs to the control for a screen reader rather than being
 * decoration a pointer happens to reveal.
 *
 * The bubble is portalled to `<body>` and positioned in viewport coordinates.
 * Every rail in this app scrolls, and a scroll container clips its children on
 * *both* axes — an absolutely-positioned bubble inside the left rail is sliced
 * off at the rail's edge, which is exactly where these hints want to sit.
 */
export default function HoverHint({
  hint,
  place = "top",
  delay = 260,
  block = false,
  style,
  children,
}: {
  /** The information itself. A short line; the bubble wraps at 240px. */
  hint: ReactNode;
  place?: Place;
  /** Dwell before opening — the pause that separates "pointing at" from
   *  "passing over". */
  delay?: number;
  /** Fill the parent's width, for a hint wrapped around a full-width row. */
  block?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<CSSProperties | null>(null);
  const { mounted, state } = usePresence(at !== null, EXIT_MS);

  const open = useCallback(() => {
    const el = anchor.current;
    if (el) setAt(anchorTo(el.getBoundingClientRect(), place));
  }, [place]);

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(open, delay);
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setAt(null);
  };

  // A hint pinned to viewport coordinates has to go the moment the page moves
  // under it — a rail scrolling, the window resizing.
  useEffect(() => {
    if (at === null) return;
    const drop = () => setAt(null);
    window.addEventListener("scroll", drop, true);
    window.addEventListener("resize", drop);
    return () => {
      window.removeEventListener("scroll", drop, true);
      window.removeEventListener("resize", drop);
    };
  }, [at]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The description has to land on the *control*, not on the wrapper around
  // it: a screen reader reading the button looks at the button's own
  // `aria-describedby`, and an ancestor's is not part of that announcement.
  const described = describe(children, mounted ? id : null);

  return (
    <span
      ref={anchor}
      onMouseEnter={arm}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      // A press is an answer to the hint; it shouldn't linger over what it
      // just opened.
      onMouseDown={close}
      style={{
        position: "relative",
        display: block ? "block" : "inline-flex",
        width: block ? "100%" : undefined,
        ...style,
      }}
    >
      {described}
      {mounted &&
        at &&
        typeof document !== "undefined" &&
        createPortal(
          // Positioner: it owns the placement transform, leaving `transform`
          // on the bubble itself free for the peek animation.
          <span
            style={{
              ...at,
              position: "fixed",
              zIndex: 60,
              pointerEvents: "none",
            }}
          >
            <span
              id={id}
              role="tooltip"
              style={{
                display: "block",
                width: "max-content",
                maxWidth: 240,
                padding: "8px 11px",
                background: "rgba(44,40,35,0.94)",
                color: color.paper,
                borderRadius: 9,
                fontFamily: font.sans,
                fontSize: 12.5,
                lineHeight: 1.45,
                boxShadow: "0 10px 26px rgba(44,40,35,0.24)",
                transformOrigin: ORIGIN[place],
                animation:
                  state === "in"
                    ? `peekIn ${motion.duration.fast}ms ${motion.ease.enter} both`
                    : `peekOut ${EXIT_MS}ms ${motion.ease.exit} both`,
              }}
            >
              {hint}
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Point the wrapped control at the bubble describing it, when it is one
 *  element and can carry the attribute. */
function describe(children: ReactNode, id: string | null): ReactNode {
  if (!isValidElement(children)) return children;
  const el = children as ReactElement<{ "aria-describedby"?: string }>;
  const own = el.props["aria-describedby"];
  return cloneElement(el, {
    "aria-describedby": [own, id].filter(Boolean).join(" ") || undefined,
  });
}

const EXIT_MS = motion.duration.fast;
const GAP = 9;
/** Half the bubble's widest possible box — how far it can be from an edge. */
const HALF = 124;

const ORIGIN: Record<Place, string> = {
  top: "50% 100%",
  bottom: "50% 0",
  right: "0 50%",
};

/** Viewport-space placement for a bubble hanging off `rect`. */
function anchorTo(rect: DOMRect, place: Place): CSSProperties {
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  const centre = Math.min(Math.max(rect.left + rect.width / 2, HALF), w - HALF);
  if (place === "right") {
    return {
      left: rect.right + GAP,
      top: rect.top + rect.height / 2,
      transform: "translateY(-50%)",
    };
  }
  return place === "bottom"
    ? { left: centre, top: rect.bottom + GAP, transform: "translateX(-50%)" }
    : {
        left: centre,
        top: rect.top - GAP,
        transform: "translate(-50%,-100%)",
      };
}
