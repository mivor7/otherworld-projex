"use client";

// A living backdrop for a game stage: slow-drifting bioluminescent motes.
// Smoothness matters, so each frame is just a handful of cheap drawImage calls
// from two pre-rendered glow sprites — no per-mote gradient allocation, capped
// at 1x device pixels (soft glows don't need retina), on its own GPU layer.
// Pauses for reduced-motion. Clips to the panel's rounded box.
import { useEffect, useRef } from "react";

export function AmbientPond() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // One soft radial glow per colour, rendered once and reused every frame.
    const sprite = (rgb: string) => {
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const c = s.getContext("2d")!;
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      return s;
    };
    const green = sprite("130,235,175");
    const gold = sprite("232,200,120");

    let raf = 0;
    let w = 0;
    let h = 0;
    type Mote = { x: number; y: number; r: number; vy: number; vx: number; a: number; gold: boolean };
    let motes: Mote[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      // 1x on purpose — glows are soft; retina fill would only cost frames.
      canvas.width = Math.max(1, Math.floor(w));
      canvas.height = Math.max(1, Math.floor(h));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const n = Math.max(12, Math.min(34, Math.floor(w / 22)));
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 8 + Math.random() * 16, // glow radius in px
        vy: -(0.05 + Math.random() * 0.22),
        vx: (Math.random() - 0.5) * 0.12,
        a: 0.05 + Math.random() * 0.11, // faint — a haze, not dots
        gold: Math.random() < 0.22,
      }));
    };
    resize();

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y += m.vy;
        m.x += m.vx;
        if (m.y < -m.r) {
          m.y = h + m.r;
          m.x = Math.random() * w;
        }
        if (m.x < -m.r) m.x = w + m.r;
        else if (m.x > w + m.r) m.x = -m.r;
        ctx.globalAlpha = m.a;
        ctx.drawImage(m.gold ? gold : green, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="ambient absolute inset-0 w-full h-full pointer-events-none"
      style={{ transform: "translateZ(0)" }}
      aria-hidden
    />
  );
}
