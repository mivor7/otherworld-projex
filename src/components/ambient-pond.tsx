"use client";

// A living backdrop for a game stage: slow-drifting bioluminescent motes over
// the dark pond, drawn on a canvas behind the panel content. Cheap (a few dozen
// soft dots), pauses for reduced-motion, and clips to the panel's rounded box.
// Reusable across every game so the tables feel alive, not static.
import { useEffect, useRef } from "react";

export function AmbientPond() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    type Mote = { x: number; y: number; r: number; vy: number; vx: number; a: number; gold: boolean };
    let motes: Mote[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(18, Math.min(56, Math.floor(w / 15)));
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.3 + Math.random() * 3,
        vy: -(0.06 + Math.random() * 0.26), // slower, dreamier drift
        vx: (Math.random() - 0.5) * 0.14,
        a: 0.16 + Math.random() * 0.4,
        gold: Math.random() < 0.25,
      }));
    };
    resize();

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y += m.vy;
        m.x += m.vx;
        if (m.y < -6) {
          m.y = h + 6;
          m.x = Math.random() * w;
        }
        if (m.x < -6) m.x = w + 6;
        else if (m.x > w + 6) m.x = -6;
        const rr = m.r * 6;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rr);
        g.addColorStop(0, m.gold ? `rgba(232,200,120,${m.a})` : `rgba(130,235,175,${m.a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
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
      aria-hidden
    />
  );
}
