"use client";

import { useEffect, useRef, type ReactNode } from "react";

const TRAVEL = 0.42;
const SPRING = 0.16;
const FRICTION = 0.86;
const LIMIT = 30;

/**
 * Publishes scroll speed as --kick on its subtree, so the collage can lean
 * into a scroll and spring back. Kept out of HeroCollage itself to leave that
 * markup on the server.
 */
export function ScrollKick({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = window.scrollY;
    let velocity = 0;
    let offset = 0;
    let frame = 0;

    const tick = () => {
      offset += (velocity * TRAVEL - offset) * SPRING;
      velocity *= FRICTION;
      const kick = Math.max(-LIMIT, Math.min(LIMIT, offset));
      el.style.setProperty("--kick", `${-kick.toFixed(2)}px`);
      if (Math.abs(kick) > 0.08 || Math.abs(velocity) > 0.08) {
        frame = requestAnimationFrame(tick);
      } else {
        el.style.setProperty("--kick", "0px");
        frame = 0;
      }
    };

    const onScroll = () => {
      const y = window.scrollY;
      velocity += y - last;
      last = y;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // display:contents keeps the wrapper out of layout; --kick still inherits.
  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
