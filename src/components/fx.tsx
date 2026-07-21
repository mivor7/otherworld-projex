"use client";

// Interaction layer — one delegated listener powers every card on every
// page: a cursor-following spotlight (CSS vars consumed by ::after in
// globals.css), a subtle 3D tilt on lot cards, and magnetic pull on
// [data-magnetic] CTAs. Everything is disabled under prefers-reduced-motion.
import { useEffect, useState } from "react";

const TILT_DEG = 4;
const MAGNET_PX = 3;

export function InteractiveFX() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const card = (t: EventTarget | null): HTMLElement | null =>
      (t as HTMLElement | null)?.closest?.(".lot-card, .panel-hover") ?? null;
    const magnet = (t: EventTarget | null): HTMLElement | null =>
      (t as HTMLElement | null)?.closest?.("[data-magnetic]") ?? null;

    // Coalesce raw pointer moves to one update per animation frame — avoids
    // layout thrash (getBoundingClientRect + style writes) on every move event.
    let rafId = 0;
    let pending: PointerEvent | null = null;
    const applyMove = (e: PointerEvent) => {
      const el = card(e.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        if (el.classList.contains("lot-card")) {
          el.style.transform = `perspective(800px) rotateX(${(0.5 - py) * TILT_DEG}deg) rotateY(${(px - 0.5) * TILT_DEG}deg)`;
        }
      }
      const m = magnet(e.target);
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        m.style.transform = `translate(${dx * MAGNET_PX}px, ${dy * MAGNET_PX}px)`;
      }
    };
    const onMove = (e: PointerEvent) => {
      pending = e;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (pending) applyMove(pending);
        });
      }
    };

    const onOut = (e: PointerEvent) => {
      const el = card(e.target);
      if (el && !el.contains(e.relatedTarget as Node)) el.style.transform = "";
      const m = magnet(e.target);
      if (m && !m.contains(e.relatedTarget as Node)) m.style.transform = "";
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);
  return null;
}

/** Thin reading-progress bar pinned above the navbar. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    // rAF-throttle: coalesce scroll bursts to one state update per frame.
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 h-[2px] z-50 pointer-events-none"
      style={{
        width: `${progress * 100}%`,
        background:
          "linear-gradient(90deg, oklch(0.78 0.11 150), oklch(0.74 0.07 290))",
        opacity: progress > 0.01 ? 0.9 : 0,
        transition: "opacity 0.3s",
      }}
    />
  );
}
