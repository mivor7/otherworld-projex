"use client";

// Living hero backdrop: the vault art gains pointer parallax, rising dust
// motes, slow-sweeping light beams and a cursor-following glow — drawn on a
// throwaway canvas above the image, below the editorial overlay. Fully
// static under prefers-reduced-motion; the render loop pauses offscreen.
import { useEffect, useRef, useState } from "react";

type Mote = { x: number; y: number; r: number; vy: number; sway: number; phase: number; a: number };

export function HeroScene({
  image,
  imagePosition = "center 40%",
}: {
  image: string;
  imagePosition?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReduced(true);
      return;
    }
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!wrap || !canvas || !img) return;
    const hero = wrap.closest(".page-hero") as HTMLElement | null;
    const ctx = canvas.getContext("2d")!;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const motes: Mote[] = Array.from({ length: 34 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.5,
      vy: 0.008 + Math.random() * 0.02,
      sway: 4 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      a: 0.15 + Math.random() * 0.4,
    }));

    // Pointer state (normalized), lerped for weight.
    const target = { x: 0.5, y: 0.5, in: 0 };
    const cur = { x: 0.5, y: 0.5, in: 0 };
    const onMove = (e: PointerEvent) => {
      const r = hero?.getBoundingClientRect();
      if (!r) return;
      target.x = (e.clientX - r.left) / r.width;
      target.y = (e.clientY - r.top) / r.height;
      target.in = 1;
    };
    const onLeave = () => {
      target.in = 0;
      target.x = 0.5;
      target.y = 0.5;
    };
    hero?.addEventListener("pointermove", onMove, { passive: true });
    hero?.addEventListener("pointerleave", onLeave, { passive: true });

    let running = true;
    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
    });
    io.observe(wrap);

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!running) return;
      const t = now - t0;

      // Lerp pointer.
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      cur.in += (target.in - cur.in) * 0.08;

      // Parallax: art drifts opposite the pointer.
      const px = (0.5 - cur.x) * 16;
      const py = (0.5 - cur.y) * 10;
      img.style.transform = `translate3d(${px}px, ${py}px, 0) scale(1.07)`;

      ctx.clearRect(0, 0, w, h);

      // Sweeping light beams, echoing the art's volumetric rays.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 2; i++) {
        const phase = i * 2.1;
        const alpha = 0.05 + 0.04 * Math.sin(t * 0.00035 + phase);
        const bx = w * (0.62 + 0.12 * i) + Math.sin(t * 0.00012 + phase) * w * 0.05;
        ctx.save();
        ctx.translate(bx, -40);
        ctx.rotate(0.42 + i * 0.12);
        const grad = ctx.createLinearGradient(0, 0, 0, h * 1.4);
        grad.addColorStop(0, `rgba(120,245,160,${alpha})`);
        grad.addColorStop(1, "rgba(120,245,160,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(-45 - i * 25, 0, 90 + i * 50, h * 1.4);
        ctx.restore();
      }

      // Rising motes.
      for (const m of motes) {
        m.y -= m.vy / 100;
        if (m.y < -0.05) {
          m.y = 1.05;
          m.x = Math.random();
        }
        const mx = m.x * w + Math.sin(t * 0.0004 + m.phase) * m.sway;
        const my = m.y * h;
        ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(t * 0.001 + m.phase));
        ctx.fillStyle = "rgb(140,245,170)";
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Cursor-following glow.
      if (cur.in > 0.01) {
        const gx = cur.x * w;
        const gy = cur.y * h;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 260);
        grad.addColorStop(0, `rgba(120,245,160,${0.13 * cur.in})`);
        grad.addColorStop(1, "rgba(120,245,160,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      hero?.removeEventListener("pointermove", onMove);
      hero?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={image}
        alt=""
        className="page-hero-bg-img"
        style={{ objectPosition: imagePosition }}
        draggable={false}
      />
      {!reduced && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
    </div>
  );
}
