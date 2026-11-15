"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mood = "welcome" | "focused" | "excited" | "impressed";

interface ChapterMeta {
  index: number;
  code: string;
  shortLabel: string;
  wing: string;
  title: string;
  route: string;
  stageSelector: string;
  initialLine: string;
  initialMood: Mood;
}

const CHAPTERS: ChapterMeta[] = [
  {
    index: 0,
    code: "01",
    shortLabel: "Treasury Desk",
    wing: "House Foundation · Solana Mainnet",
    title: "One Transparent Treasury",
    route: "/",
    stageSelector: "#buy",
    initialLine:
      "Welcome to Other World Projex. Every table, auction lot, and bounty pool runs through one verifiable Solana treasury.",
    initialMood: "welcome",
  },
  {
    index: 1,
    code: "02",
    shortLabel: "Frog Flip",
    wing: "Wing I · Provably-Fair Table",
    title: "Frog Flip · Double or Nothing",
    route: "/games/flip",
    stageSelector: ".game-stage",
    initialLine:
      "Every table has an instant Sandbox mode. Watch me call Frog, flip the coin, and press our winning streak.",
    initialMood: "focused",
  },
  {
    index: 2,
    code: "03",
    shortLabel: "Pond Dice",
    wing: "Wing I · Custom Odds Slider",
    title: "Pond Dice · Dial Your Own Edge",
    route: "/games/dice",
    stageSelector: ".game-stage",
    initialLine:
      "Slide the target line anywhere from 2 to 98. Tighter zones pay higher multipliers — watch me dial 30% for a 3.23× roll.",
    initialMood: "focused",
  },
  {
    index: 3,
    code: "04",
    shortLabel: "60 Hz Hopper",
    wing: "Wing I · Deterministic Skill Arcade",
    title: "Hopper · 60 Hz Server-Verified Replay",
    route: "/games/hopper",
    stageSelector: ".game-stage",
    initialLine:
      "Free arcade episodes run a deterministic 60 Hz simulation. Every hop is recorded and replayed on the server for weekly prizes.",
    initialMood: "focused",
  },
  {
    index: 4,
    code: "05",
    shortLabel: "Bounty Board",
    wing: "Wing III · Pro-Rata Prize Pools",
    title: "The Bounty Board · Automatic Payouts",
    route: "/bounties",
    stageSelector: "main",
    initialLine:
      "Every round played across the House unlocks fixed $OWP bounty pools. When a meter fills, eligible hunters are paid automatically.",
    initialMood: "impressed",
  },
];

const START_EVENT = "owp:enter-other-world";

export function launchOtherWorldTour(chapter = 0) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ chapter: number }>(START_EVENT, {
      detail: { chapter },
    })
  );
}

/* ————————————————————————————————————————————————————————————————
   1. HOMEPAGE LAUNCHER CARD (<EnterOtherWorld />)
   Featuring a live 60fps 3D Portal Vortex Canvas + Chapter Jumpers
   ———————————————————————————————————————————————————————————————— */

function PortalVortexCanvas({ hovered }: { hovered: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const hoveredRef = useRef(hovered);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 320;
    const H = 210;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const stars = Array.from({ length: 42 }, (_, i) => ({
      angle: (i / 42) * Math.PI * 2 + (i % 5) * 0.3,
      z: (i / 42) * 1,
      speed: 0.0045 + (i % 4) * 0.0012,
      gold: i % 3 === 0,
    }));

    let raf = 0;
    const render = (now: number) => {
      const t = now * 0.001;
      const m = mouseRef.current;
      m.x += (m.tx - m.x) * 0.08;
      m.y += (m.ty - m.y) * 0.08;

      const boost = hoveredRef.current ? 1.45 : 1;
      ctx.clearRect(0, 0, W, H);

      const cx = W * 0.5 + m.x * 16;
      const cy = H * 0.5 + m.y * 12;

      // Deep ambient portal glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 128);
      bgGrad.addColorStop(0, "oklch(0.78 0.11 150 / 0.24)");
      bgGrad.addColorStop(0.45, "oklch(0.74 0.12 290 / 0.10)");
      bgGrad.addColorStop(1, "oklch(0.08 0.01 165 / 0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 3D concentric tunnel rings
      const ringCount = 7;
      for (let i = 0; i < ringCount; i++) {
        const progress = ((i / ringCount + t * 0.18 * boost) % 1 + 1) % 1;
        const scale = Math.pow(progress, 1.55);
        const rx = 18 + scale * 120;
        const ry = 12 + scale * 76;
        const ox = W * 0.5 + m.x * (1 - progress) * 26;
        const oy = H * 0.5 + m.y * (1 - progress) * 18;
        const alpha = Math.sin(progress * Math.PI) * 0.52;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(t * 0.22 * (i % 2 === 0 ? 1 : -1) + i * 0.4);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle =
          i % 3 === 0
            ? `oklch(0.82 0.12 85 / ${alpha.toFixed(3)})`
            : `oklch(0.78 0.11 150 / ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + scale * 1.1;
        ctx.setLineDash(i % 2 === 0 ? [8, 6] : []);
        ctx.stroke();
        ctx.restore();
      }

      // Orbiting depth particles
      for (const s of stars) {
        s.z += s.speed * boost;
        if (s.z > 1) s.z -= 1;
        s.angle += 0.008 * boost;
        const depth = Math.pow(s.z, 1.4);
        const px = cx + Math.cos(s.angle) * (14 + depth * 124);
        const py = cy + Math.sin(s.angle) * (10 + depth * 78);
        const r = 0.8 + depth * 2.1;
        const a = Math.sin(s.z * Math.PI) * 0.85;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = s.gold
          ? `oklch(0.84 0.12 85 / ${a.toFixed(3)})`
          : `oklch(0.82 0.12 150 / ${a.toFixed(3)})`;
        ctx.fill();
      }

      // Center Stylized Geometric Croupier Emblem
      const bob = Math.sin(t * 2.4) * 3.5;
      ctx.save();
      ctx.translate(cx, cy + bob);

      // Outer octagonal halo
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.4;
        const r = 28;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "oklch(0.12 0.015 160 / 0.9)";
      ctx.fill();
      ctx.strokeStyle = "oklch(0.82 0.12 85 / 0.65)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Stylized Frog Croupier Silhouette inside emblem
      ctx.fillStyle = "oklch(0.72 0.12 150)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 13, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eye domes
      ctx.beginPath();
      ctx.arc(-7, -7, 5.2, 0, Math.PI * 2);
      ctx.arc(7, -7, 5.2, 0, Math.PI * 2);
      ctx.fill();

      // Glowing gold/obsidian eyes
      ctx.fillStyle = "oklch(0.10 0.01 160)";
      ctx.beginPath();
      ctx.arc(-7 + m.x * 1.5, -7 + m.y * 1.2, 2.7, 0, Math.PI * 2);
      ctx.arc(7 + m.x * 1.5, -7 + m.y * 1.2, 2.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "oklch(0.88 0.12 85)";
      ctx.beginPath();
      ctx.arc(-7.8 + m.x * 1.5, -7.8 + m.y * 1.2, 1.1, 0, Math.PI * 2);
      ctx.arc(6.2 + m.x * 1.5, -7.8 + m.y * 1.2, 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Gold dealer visor brim
      ctx.strokeStyle = "oklch(0.84 0.12 85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -3, 12, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="relative rounded-xl overflow-hidden border select-none"
      style={{
        borderColor: "var(--hairline-strong)",
        background:
          "radial-gradient(circle at 50% 50%, oklch(0.14 0.02 160), oklch(0.08 0.008 265))",
      }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mouseRef.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        mouseRef.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }}
      onMouseLeave={() => {
        mouseRef.current.tx = 0;
        mouseRef.current.ty = 0;
      }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-[188px] sm:h-[204px] object-cover"
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between text-[0.65rem] mono uppercase tracking-wider">
        <span className="px-2 py-0.5 rounded bg-abyss/80 text-neon border border-white/10">
          Live Co-Pilot · 60 FPS
        </span>
        <span className="px-2 py-0.5 rounded bg-abyss/80 text-gold border border-white/10">
          5 Live Stops
        </span>
      </div>
    </div>
  );
}

export function EnterOtherWorld() {
  const [hovered, setHovered] = useState(false);

  return (
    <section className="mt-8" aria-label="Interactive walkthrough">
      <div
        className="panel panel-glow panel-etched p-5 sm:p-7 transition-all"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
              <span className="inline-flex items-center gap-2 text-xs mono uppercase tracking-widest text-neon">
                <span className="live-dot" />
                Interactive House Walkthrough
              </span>
              <span className="text-xs mono text-fog/70">
                · Opt-in · Real site interaction
              </span>
            </div>

            <h2 className="display text-2xl sm:text-3xl text-frost tracking-tight mb-2.5">
              Enter the <span className="neon-text">Other World.</span>
            </h2>

            <p className="text-fog text-sm sm:text-base leading-relaxed max-w-2xl mb-5">
              Take a 45-second guided run with the House Croupier. Watch our
              live co-pilot glide across the real site — inspecting the Solana
              treasury desk, flipping a winning streak on{" "}
              <span className="text-frost">Frog Flip</span>, dialing a{" "}
              <span className="text-gold">3.23×</span> roll on{" "}
              <span className="text-frost">Pond Dice</span>, dodging traffic in{" "}
              <span className="text-frost">60 Hz Hopper</span>, and unlocking
              the <span className="text-frost">Bounty Board</span>.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <button
                type="button"
                data-owp-trigger="enter-other-world"
                onClick={() => launchOtherWorldTour(0)}
                className="btn btn-primary btn-lg group"
              >
                <span>Enter the Other World</span>
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>
              <span className="text-xs text-fog">
                Or jump straight to any live station below:
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CHAPTERS.map((ch) => (
                <button
                  key={ch.code}
                  type="button"
                  onClick={() => launchOtherWorldTour(ch.index)}
                  className="chip text-xs hover:border-neon/50 transition-colors"
                >
                  <span className="mono text-gold mr-1">{ch.code}</span>
                  <span>{ch.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <PortalVortexCanvas hovered={hovered} />
        </div>
      </div>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————————
   2. ANIMATED CARTOON CROUPIER AVATAR (<CroupierAvatarCanvas />)
   60fps Stylized Geometric Frog Croupier whose eyes track the live
   Comet Cursor across the screen and reacts to every win!
   ———————————————————————————————————————————————————————————————— */

function CroupierAvatarCanvas({
  mood,
  cursorPosRef,
}: {
  mood: Mood;
  cursorPosRef: React.RefObject<{ x: number; y: number }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moodRef = useRef<Mood>(mood);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = 72;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const render = (now: number) => {
      const t = now * 0.001;
      const m = moodRef.current;
      ctx.clearRect(0, 0, S, S);

      // Compute eye look vector toward the live Comet Cursor
      let lx = 0;
      let ly = 0;
      const rect = canvas.getBoundingClientRect();
      const cPos = cursorPosRef.current;
      if (cPos && rect.width > 0) {
        const dx = cPos.x - (rect.left + rect.width * 0.5);
        const dy = cPos.y - (rect.top + rect.height * 0.5);
        const dist = Math.hypot(dx, dy) || 1;
        const mag = Math.min(2.6, dist / 140);
        lx = (dx / dist) * mag;
        ly = (dy / dist) * mag;
      }

      // Subtle background glow ring
      const bg = ctx.createRadialGradient(36, 36, 6, 36, 36, 35);
      bg.addColorStop(
        0,
        m === "excited"
          ? "oklch(0.84 0.14 85 / 0.28)"
          : "oklch(0.78 0.11 150 / 0.22)"
      );
      bg.addColorStop(1, "oklch(0.10 0.01 165 / 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);

      const bounce =
        m === "excited"
          ? Math.abs(Math.sin(t * 7)) * -3.2
          : Math.sin(t * 2.6) * 1.5;

      ctx.save();
      ctx.translate(36, 40 + bounce);

      // Tailored Obsidian Suit Collar & Gold Bowtie
      ctx.fillStyle = "oklch(0.15 0.015 260)";
      ctx.beginPath();
      ctx.moveTo(-18, 14);
      ctx.lineTo(18, 14);
      ctx.lineTo(23, 28);
      ctx.lineTo(-23, 28);
      ctx.closePath();
      ctx.fill();

      // Gold Bowtie
      ctx.fillStyle = "oklch(0.83 0.13 85)";
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.lineTo(-7, 13);
      ctx.lineTo(-7, 21);
      ctx.closePath();
      ctx.moveTo(0, 17);
      ctx.lineTo(7, 13);
      ctx.lineTo(7, 21);
      ctx.closePath();
      ctx.fill();

      // Stylized Sculpted Frog Head
      const headGrad = ctx.createLinearGradient(0, -16, 0, 14);
      headGrad.addColorStop(0, "oklch(0.78 0.13 150)");
      headGrad.addColorStop(1, "oklch(0.56 0.11 152)");
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(0, 1, 18, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "oklch(0.86 0.12 150 / 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Lighter Jade Chin
      ctx.fillStyle = "oklch(0.84 0.09 145 / 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 5.5, 12.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eye Domes
      ctx.fillStyle = "oklch(0.75 0.13 150)";
      ctx.beginPath();
      ctx.arc(-9.5, -10.5, 7.2, 0, Math.PI * 2);
      ctx.arc(9.5, -10.5, 7.2, 0, Math.PI * 2);
      ctx.fill();

      // Natural Blink every 3.8s
      const blinkPhase = t % 3.8;
      const isBlinking = blinkPhase > 3.66;

      if (isBlinking) {
        ctx.strokeStyle = "oklch(0.14 0.02 160)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-14, -10.5);
        ctx.lineTo(-5, -10.5);
        ctx.moveTo(5, -10.5);
        ctx.lineTo(14, -10.5);
        ctx.stroke();
      } else {
        // Sclera
        ctx.fillStyle = "oklch(0.97 0.01 150)";
        ctx.beginPath();
        ctx.arc(-9.5, -10.5, 5.3, 0, Math.PI * 2);
        ctx.arc(9.5, -10.5, 5.3, 0, Math.PI * 2);
        ctx.fill();

        // Pupils tracking the live Comet Cursor
        ctx.fillStyle = "oklch(0.12 0.015 260)";
        ctx.beginPath();
        ctx.arc(-9.5 + lx, -10.5 + ly, 2.8, 0, Math.PI * 2);
        ctx.arc(9.5 + lx, -10.5 + ly, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Gold Eye Glints
        ctx.fillStyle = "oklch(0.90 0.12 85)";
        ctx.beginPath();
        ctx.arc(-10.5 + lx * 0.8, -11.7 + ly * 0.8, 1.1, 0, Math.PI * 2);
        ctx.arc(8.5 + lx * 0.8, -11.7 + ly * 0.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Croupier Translucent Emerald/Gold Visor
      ctx.save();
      ctx.rotate(m === "impressed" ? -0.06 : 0);
      ctx.fillStyle = "oklch(0.18 0.03 160 / 0.88)";
      ctx.strokeStyle = "oklch(0.84 0.13 85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -15.5, 14, 4.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Expression Mouth
      ctx.strokeStyle = "oklch(0.14 0.02 160)";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (m === "excited") {
        ctx.fillStyle = "oklch(0.16 0.02 160)";
        ctx.arc(0, 3.5, 5.2, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (m === "impressed") {
        ctx.arc(0, 5, 6.5, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else {
        ctx.arc(0, 3.5, 5.5, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
      }

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [cursorPosRef]);

  return (
    <div
      className="relative shrink-0 w-[68px] h-[68px] rounded-xl border overflow-hidden"
      style={{
        borderColor: "oklch(0.78 0.11 150 / 0.38)",
        background:
          "radial-gradient(circle at 50% 35%, oklch(0.16 0.02 160), oklch(0.09 0.01 265))",
      }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <span
        className="absolute bottom-1 right-1 w-2 h-2 rounded-full"
        style={{
          background: "var(--color-neon)",
          boxShadow: "0 0 8px var(--color-neon)",
        }}
      />
    </div>
  );
}

/* ————————————————————————————————————————————————————————————————
   3. FULL-VIEWPORT TRANSPARENT 60FPS COMET CURSOR & SHOCKWAVE CANVAS
   Never darkens or blocks the page (`pointer-events-none`).
   Draws the spring-physics Comet Cursor, stardust ribbon trail,
   portal entry wave, and click spark bursts!
   ———————————————————————————————————————————————————————————————— */

interface ClickBurst {
  x: number;
  y: number;
  born: number;
  sparks: { angle: number; speed: number; gold: boolean }[];
}

/* ————————————————————————————————————————————————————————————————
   4. LIVE WEBSITE CO-PILOT DIRECTOR (<OtherWorldDirector />)
   Mounted in RootLayout. Persists across routes and drives real UI.
   ———————————————————————————————————————————————————————————————— */

export function OtherWorldDirector() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [line, setLine] = useState(CHAPTERS[0].initialLine);
  const [mood, setMood] = useState<Mood>(CHAPTERS[0].initialMood);
  const [stepProgress, setStepProgress] = useState(0);

  const runIdRef = useRef(0);
  const pausedRef = useRef(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorTargetElRef = useRef<HTMLElement | null>(null);
  const cursorFallbackRef = useRef({ x: 500, y: 340 });
  const cursorPosRef = useRef({ x: 500, y: 340 });
  const burstsRef = useRef<ClickBurst[]>([]);
  const portalWaveBornRef = useRef(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const cleanupStageAttributes = useCallback(() => {
    if (typeof document === "undefined") return;
    document
      .querySelectorAll("[data-owp-stage]")
      .forEach((el) => el.removeAttribute("data-owp-stage"));
    document
      .querySelectorAll("[data-owp-clicked]")
      .forEach((el) => el.removeAttribute("data-owp-clicked"));
  }, []);

  const stopTour = useCallback(() => {
    runIdRef.current += 1;
    setActive(false);
    setPaused(false);
    cursorTargetElRef.current = null;
    if (typeof document !== "undefined") {
      document.documentElement.removeAttribute("data-owp-tour");
    }
    cleanupStageAttributes();
  }, [cleanupStageAttributes]);

  const startTour = useCallback(
    (startChapter = 0) => {
      const idx = Math.max(0, Math.min(CHAPTERS.length - 1, startChapter));
      runIdRef.current += 1;
      if (typeof window !== "undefined") {
        cursorPosRef.current = {
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.45,
        };
        cursorFallbackRef.current = {
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.45,
        };
      }
      portalWaveBornRef.current = performance.now();
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-owp-tour", "1");
      }
      setPaused(false);
      setChapter(idx);
      setLine(CHAPTERS[idx].initialLine);
      setMood(CHAPTERS[idx].initialMood);
      setStepProgress(0.08);
      setActive(true);
    },
    []
  );

  // Listen for homepage trigger button & Esc key
  useEffect(() => {
    const onLaunch = (e: Event) => {
      const idx = (e as CustomEvent<{ chapter?: number }>).detail?.chapter ?? 0;
      startTour(idx);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active) {
        stopTour();
      }
    };
    window.addEventListener(START_EVENT, onLaunch);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(START_EVENT, onLaunch);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, startTour, stopTour]);

  // 60fps Transparent Comet Cursor & Shockwave Overlay Canvas Loop
  useEffect(() => {
    if (!active) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const vel = { vx: 0, vy: 0 };
    const trail: { x: number; y: number }[] = [];

    let raf = 0;
    const render = (now: number) => {
      ctx.clearRect(0, 0, width, height);

      // 1. Expanding Portal Entry Shockwave (purely additive rings, never darkens screen)
      const waveAge = now - portalWaveBornRef.current;
      if (waveAge >= 0 && waveAge < 950) {
        const p = waveAge / 950;
        const ease = 1 - Math.pow(1 - p, 3);
        const maxR = Math.hypot(width, height) * 0.65;
        for (let i = 0; i < 3; i++) {
          const r = ease * maxR - i * 42;
          if (r <= 0) continue;
          const alpha = (1 - p) * (0.42 - i * 0.11);
          ctx.beginPath();
          ctx.arc(width * 0.5, height * 0.45, r, 0, Math.PI * 2);
          ctx.strokeStyle =
            i === 1
              ? `oklch(0.84 0.13 85 / ${alpha.toFixed(3)})`
              : `oklch(0.78 0.12 150 / ${alpha.toFixed(3)})`;
          ctx.lineWidth = 2.2 - i * 0.5;
          ctx.stroke();
        }
      }

      // 2. Resolve live target coordinates from real DOM element
      let tx = cursorFallbackRef.current.x;
      let ty = cursorFallbackRef.current.y;
      const el = cursorTargetElRef.current;
      let targetRect: DOMRect | null = null;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          targetRect = r;
          tx = r.left + r.width * 0.5;
          ty = r.top + r.height * 0.5;
          cursorFallbackRef.current = { x: tx, y: ty };
        }
      }

      // Draw subtle corner brackets around active target button
      if (targetRect) {
        const pad = 6;
        const x0 = targetRect.left - pad;
        const y0 = targetRect.top - pad;
        const x1 = targetRect.right + pad;
        const y1 = targetRect.bottom + pad;
        const cLen = Math.min(10, targetRect.height * 0.35);

        ctx.strokeStyle = "oklch(0.82 0.12 150 / 0.72)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + cLen);
        ctx.lineTo(x0, y0);
        ctx.lineTo(x0 + cLen, y0);
        ctx.moveTo(x1 - cLen, y0);
        ctx.lineTo(x1, y0);
        ctx.lineTo(x1, y0 + cLen);
        ctx.moveTo(x0, y1 - cLen);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x0 + cLen, y1);
        ctx.moveTo(x1 - cLen, y1);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1, y1 - cLen);
        ctx.stroke();
      }

      // 3. Spring-physics Comet Cursor update
      const pos = cursorPosRef.current;
      const stiffness = 0.14;
      const damping = 0.76;
      vel.vx = (vel.vx + (tx - pos.x) * stiffness) * damping;
      vel.vy = (vel.vy + (ty - pos.y) * stiffness) * damping;
      pos.x += vel.vx;
      pos.y += vel.vy;

      trail.unshift({ x: pos.x, y: pos.y });
      if (trail.length > 20) trail.pop();

      // 4. Stardust Ribbon Trail
      if (trail.length > 2) {
        for (let i = 1; i < trail.length; i++) {
          const p0 = trail[i - 1];
          const p1 = trail[i];
          const ratio = 1 - i / trail.length;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle =
            i < 6
              ? `oklch(0.84 0.13 85 / ${(ratio * 0.75).toFixed(3)})`
              : `oklch(0.78 0.12 150 / ${(ratio * 0.55).toFixed(3)})`;
          ctx.lineWidth = ratio * 5.5;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      // 5. Click Shockwave Bursts
      const activeBursts: ClickBurst[] = [];
      for (const b of burstsRef.current) {
        const age = now - b.born;
        if (age > 620) continue;
        activeBursts.push(b);
        const p = age / 620;
        const ease = 1 - Math.pow(1 - p, 3);
        const alpha = 1 - p;

        ctx.beginPath();
        ctx.arc(b.x, b.y, 8 + ease * 48, 0, Math.PI * 2);
        ctx.strokeStyle = `oklch(0.84 0.13 85 / ${(alpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = 2.2 * (1 - p * 0.6);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.x, b.y, 4 + ease * 28, 0, Math.PI * 2);
        ctx.strokeStyle = `oklch(0.78 0.12 150 / ${(alpha * 0.7).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (const s of b.sparks) {
          const dist = 6 + ease * s.speed;
          const sx = b.x + Math.cos(s.angle) * dist;
          const sy = b.y + Math.sin(s.angle) * dist;
          ctx.beginPath();
          ctx.arc(sx, sy, (1 - p) * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = s.gold
            ? `oklch(0.86 0.13 85 / ${alpha.toFixed(3)})`
            : `oklch(0.82 0.12 150 / ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }
      burstsRef.current = activeBursts;

      // 6. Sleek Geometric Co-Pilot Cursor Head
      ctx.save();
      ctx.translate(pos.x, pos.y);

      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      halo.addColorStop(0, "oklch(0.86 0.13 85 / 0.55)");
      halo.addColorStop(0.5, "oklch(0.78 0.12 150 / 0.25)");
      halo.addColorStop(1, "oklch(0.78 0.12 150 / 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      // Precision pointer arrow
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 17);
      ctx.lineTo(4.8, 12.8);
      ctx.lineTo(8.5, 19.5);
      ctx.lineTo(11.4, 18);
      ctx.lineTo(7.6, 11.4);
      ctx.lineTo(13.5, 11.4);
      ctx.closePath();
      ctx.fillStyle = "oklch(0.12 0.015 160)";
      ctx.fill();
      ctx.strokeStyle = "oklch(0.86 0.13 85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Glowing core dot at tip
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "oklch(0.88 0.13 150)";
      ctx.fill();

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  // Single-owner async/await choreography runner (depends ONLY on [active, chapter])
  useEffect(() => {
    if (!active) return;

    const myRunId = ++runIdRef.current;
    const isCancelled = () => runIdRef.current !== myRunId;

    const sleep = async (ms: number) => {
      const step = 40;
      let elapsed = 0;
      while (elapsed < ms) {
        if (isCancelled()) return false;
        if (!pausedRef.current) {
          elapsed += step;
        }
        await new Promise((r) => setTimeout(r, step));
      }
      return !isCancelled();
    };

    const spawnClickBurst = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width * 0.5;
      const y = r.top + r.height * 0.5;
      burstsRef.current.push({
        x,
        y,
        born: performance.now(),
        sparks: Array.from({ length: 16 }, (_, i) => ({
          angle: (i / 16) * Math.PI * 2 + (i % 3) * 0.15,
          speed: 26 + (i % 4) * 12,
          gold: i % 2 === 0,
        })),
      });
      el.setAttribute("data-owp-clicked", "1");
      setTimeout(() => {
        if (el.isConnected) el.removeAttribute("data-owp-clicked");
      }, 430);
    };

    const findButtonByText = (
      textSnippet: string,
      root: ParentNode = document
    ): HTMLElement | null => {
      const needle = textSnippet.toLowerCase();
      const candidates = root.querySelectorAll<HTMLElement>(
        "button, a.btn, a.chip, [role='button']"
      );
      for (const el of candidates) {
        if (el.closest("[data-owp-dock]")) continue;
        const label = (el.textContent || "").trim().toLowerCase();
        if (label.includes(needle)) return el;
      }
      return null;
    };

    const aimAndClick = async (
      el: HTMLElement | null,
      waitBeforeClickMs = 520,
      triggerClick = true
    ) => {
      if (!el || isCancelled()) return false;
      cursorTargetElRef.current = el;
      if (!(await sleep(waitBeforeClickMs))) return false;
      if (isCancelled() || !el.isConnected) return false;
      spawnClickBurst(el);
      if (triggerClick) {
        el.click();
      }
      return true;
    };

    const waitForRouteAndStage = async (
      route: string,
      selector: string
    ): Promise<HTMLElement | null> => {
      if (window.location.pathname !== route) {
        router.push(route);
      }
      for (let i = 0; i < 90; i++) {
        if (isCancelled()) return null;
        if (window.location.pathname === route) {
          const el = document.querySelector<HTMLElement>(selector);
          if (el) return el;
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      return document.querySelector<HTMLElement>("main");
    };

    const runChapter = async () => {
      const meta = CHAPTERS[chapter] ?? CHAPTERS[0];
      cleanupStageAttributes();
      setLine(meta.initialLine);
      setMood(meta.initialMood);
      setStepProgress(0.1);

      const stageEl = await waitForRouteAndStage(meta.route, meta.stageSelector);
      if (!stageEl || isCancelled()) return;

      stageEl.setAttribute("data-owp-stage", "active");
      const rect = stageEl.getBoundingClientRect();
      const targetScrollY = Math.max(
        0,
        window.scrollY + rect.top - Math.max(72, (window.innerHeight - Math.min(rect.height, 560)) * 0.35)
      );
      window.scrollTo({ top: targetScrollY, behavior: "smooth" });
      cursorTargetElRef.current = stageEl;
      if (!(await sleep(520))) return;

      if (chapter === 0) {
        // CHAPTER 1: Treasury Desk (#buy)
        setStepProgress(0.35);
        const preset100k = findButtonByText("100k", stageEl);
        if (preset100k) {
          setLine(
            "Pick a quick $OWP preset on the live Jupiter Swap Quote desk — quotes stream straight from Solana liquidity."
          );
          setMood("focused");
          await aimAndClick(preset100k, 600, true);
        }
        if (!(await sleep(900))) return;

        setStepProgress(0.75);
        const preset250k = findButtonByText("250k", stageEl);
        if (preset250k) {
          setLine(
            "Scale up to 250k $OWP — zero middlemen, one house wallet funding every game and bounty."
          );
          setMood("impressed");
          await aimAndClick(preset250k, 580, true);
        }
        if (!(await sleep(1300))) return;
      } else if (chapter === 1) {
        // CHAPTER 2: Frog Flip (/games/flip)
        setStepProgress(0.25);
        const sandboxBtn = findButtonByText("sandbox", stageEl);
        if (sandboxBtn && !sandboxBtn.classList.contains("active")) {
          await aimAndClick(sandboxBtn, 420, true);
        }

        const frogSideBtn = findButtonByText("frog", stageEl);
        if (frogSideBtn) {
          await aimAndClick(frogSideBtn, 450, true);
        }

        setStepProgress(0.5);
        const flipBtn =
          findButtonByText("flip (practice)", stageEl) ||
          findButtonByText("flip it", stageEl);
        if (flipBtn) {
          setLine("Calling Frog on the practice table — let's send the coin spinning!");
          setMood("focused");
          await aimAndClick(flipBtn, 560, true);
        }

        // Wait for 700ms practice timeout + 1150ms coin spin animation
        if (!(await sleep(2050))) return;

        setStepProgress(0.8);
        const doubleBtn = findButtonByText("double or nothing", stageEl);
        if (doubleBtn) {
          setLine(
            "First flip landed Frog! Let's press the pot with Double or Nothing for a 2× streak."
          );
          setMood("excited");
          await aimAndClick(doubleBtn, 620, true);
          if (!(await sleep(2050))) return;
        }
        setLine("🔥 2× streak on the board! Cash out anytime or keep letting it ride.");
        setMood("excited");
        if (!(await sleep(900))) return;
      } else if (chapter === 2) {
        // CHAPTER 3: Pond Dice (/games/dice)
        setStepProgress(0.3);
        const sandboxBtn = findButtonByText("sandbox", stageEl);
        if (sandboxBtn && !sandboxBtn.classList.contains("active")) {
          await aimAndClick(sandboxBtn, 420, true);
        }

        const slider = stageEl.querySelector<HTMLInputElement>("input[type='range']");
        if (slider) {
          cursorTargetElRef.current = slider;
          setLine("Dialing the target line to 30% — boosting our payout multiplier to 3.23×.");
          setMood("focused");
          for (const val of [44, 36, 30]) {
            if (!(await sleep(180))) return;
            window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: val }));
          }
          spawnClickBurst(slider);
        }

        if (!(await sleep(450))) return;
        setStepProgress(0.65);
        const rollBtn =
          findButtonByText("roll (practice)", stageEl) ||
          findButtonByText("roll", stageEl);
        if (rollBtn) {
          setLine("Rolling under 30 for a 3.23× payout…");
          await aimAndClick(rollBtn, 560, true);
        }

        if (!(await sleep(1100))) return;
        setStepProgress(0.92);
        setLine("Right inside the green win zone! Every live roll is SHA-256 verifiable.");
        setMood("excited");
        if (!(await sleep(1150))) return;
      } else if (chapter === 3) {
        // CHAPTER 4: 60 Hz Hopper (/games/hopper)
        setStepProgress(0.3);
        const startBtn =
          findButtonByText("start hopping", stageEl) ||
          findButtonByText("hop again", stageEl);
        if (startBtn) {
          setLine("Launching the 60 Hz Hopper canvas — watch the frog thread live traffic!");
          setMood("focused");
          await aimAndClick(startBtn, 540, true);
        }

        const canvasEl = stageEl.querySelector<HTMLElement>("canvas");
        if (canvasEl) {
          cursorTargetElRef.current = canvasEl;
        }

        if (!(await sleep(1400))) return;
        setStepProgress(0.75);
        setLine(
          "Every forward lane scores progress points — server replay verifies the exact frame trace."
        );
        setMood("excited");
        if (!(await sleep(1900))) return;
      } else if (chapter === 4) {
        // CHAPTER 5: Bounty Board (/bounties)
        setStepProgress(0.45);
        const firstCard =
          document.querySelector<HTMLElement>("main .panel") || stageEl;
        cursorTargetElRef.current = firstCard;
        setLine(
          "Live Bounty Pools unlock automatically as rounds settle. Play any game or explore on your own!"
        );
        setMood("impressed");
        if (!(await sleep(2200))) return;
      }

      setStepProgress(1);
      if (isCancelled()) return;

      if (chapter < CHAPTERS.length - 1) {
        setChapter((c) => c + 1);
      } else {
        stopTour();
      }
    };

    runChapter();
  }, [active, chapter, cleanupStageAttributes, router, stopTour]);

  if (!active) return null;

  const meta = CHAPTERS[chapter] ?? CHAPTERS[0];

  return (
    <>
      {/* Full-viewport transparent 60fps Comet Cursor & Click Sparks Canvas */}
      <canvas
        ref={overlayCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50"
      />

      {/* Compact Floating Glass Story Dock — bottom-right, never blocks the site */}
      <aside
        data-owp-dock="1"
        aria-label="Other World Live Co-Pilot"
        className="fixed bottom-4 right-4 z-50 w-[min(92vw,430px)] rounded-2xl border p-4 shadow-2xl transition-all"
        style={{
          background:
            "linear-gradient(165deg, oklch(0.13 0.014 165 / 0.94), oklch(0.09 0.01 265 / 0.96))",
          borderColor: "oklch(0.78 0.11 150 / 0.38)",
          backdropFilter: "blur(16px)",
          boxShadow:
            "0 24px 60px -12px oklch(0 0 0 / 0.82), 0 0 40px -14px oklch(0.78 0.11 150 / 0.28)",
        }}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[0.65rem] mono uppercase tracking-wider text-neon">
              <span>Chapter {meta.code} / 05</span>
              <span className="text-fog">·</span>
              <span className="text-gold truncate">{meta.wing}</span>
            </div>
            <h3 className="display text-base text-frost truncate">
              {meta.title}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={stopTour}
              className="chip !py-1 !px-2.5 text-xs text-neon border-neon/40 hover:bg-neon/10"
              title="Stop guided tour and stay on this page"
            >
              Play Here →
            </button>
            <button
              type="button"
              onClick={stopTour}
              aria-label="Exit tour"
              className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-fog hover:text-frost hover:border-white/25 transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Croupier Avatar + Live Commentary */}
        <div className="flex items-center gap-3.5 mb-3.5">
          <CroupierAvatarCanvas mood={mood} cursorPosRef={cursorPosRef} />
          <p className="text-xs sm:text-sm text-frost/95 leading-snug flex-1">
            {line}
          </p>
        </div>

        {/* Chapter Progress Pills + Transport Controls */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
          <div className="flex items-center gap-1 flex-1">
            {CHAPTERS.map((ch) => {
              const isCurrent = ch.index === chapter;
              const isDone = ch.index < chapter;
              return (
                <button
                  key={ch.code}
                  type="button"
                  onClick={() => setChapter(ch.index)}
                  title={`${ch.code} · ${ch.shortLabel}`}
                  className="group relative h-6 flex-1 rounded-md border overflow-hidden transition-all text-[0.62rem] mono"
                  style={{
                    borderColor: isCurrent
                      ? "oklch(0.78 0.11 150 / 0.65)"
                      : "var(--hairline-strong)",
                    background: "oklch(0.08 0.01 165 / 0.8)",
                  }}
                >
                  <span
                    className="absolute inset-y-0 left-0 transition-all duration-300"
                    style={{
                      width: isDone
                        ? "100%"
                        : isCurrent
                          ? `${Math.round(stepProgress * 100)}%`
                          : "0%",
                      background: isCurrent
                        ? "oklch(0.78 0.11 150 / 0.28)"
                        : "oklch(0.78 0.11 150 / 0.16)",
                    }}
                  />
                  <span
                    className={`relative z-10 ${
                      isCurrent
                        ? "text-neon font-semibold"
                        : isDone
                          ? "text-frost/80"
                          : "text-fog"
                    }`}
                  >
                    {ch.code}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={chapter === 0}
              onClick={() => setChapter((c) => Math.max(0, c - 1))}
              aria-label="Previous chapter"
              className="w-7 h-6 rounded border border-white/10 text-xs text-fog hover:text-frost disabled:opacity-35"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume tour" : "Pause tour"}
              className="px-2 h-6 rounded border border-white/10 text-[0.65rem] mono text-frost hover:border-neon/40"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (chapter < CHAPTERS.length - 1) {
                  setChapter((c) => c + 1);
                } else {
                  stopTour();
                }
              }}
              aria-label="Next chapter"
              className="w-7 h-6 rounded border border-white/10 text-xs text-fog hover:text-frost"
            >
              →
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
