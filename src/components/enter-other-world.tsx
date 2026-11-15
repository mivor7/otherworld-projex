"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SealMark } from "./seal";
import { startTourSim, stopTourSim } from "./tour-sim";

type Mood = "welcome" | "focused" | "excited" | "impressed";
type VaultPhase = "idle" | "closing" | "locked" | "opening";

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
    shortLabel: "Buy & Wings",
    wing: "House Foundation · Solana Mainnet",
    title: "One Treasury · Buy $OWP & Three Wings",
    route: "/",
    stageSelector: "#buy",
    initialLine:
      "Welcome to Other World Projex. Watch me pick up 0.5 SOL of $OWP in simulation mode — one balance powers every game, bid, and bounty.",
    initialMood: "welcome",
  },
  {
    index: 1,
    code: "02",
    shortLabel: "Frog Flip",
    wing: "Wing I · Table 01",
    title: "Frog Flip · 3× Streak & Bounty Win",
    route: "/games/flip",
    stageSelector: ".game-stage",
    initialLine:
      "Step onto Wing I at Frog Flip. Watch me stake real-style $OWP, press a 3× Double-or-Nothing streak, fill the pool, and claim the bounty!",
    initialMood: "focused",
  },
  {
    index: 2,
    code: "03",
    shortLabel: "Pond Dice",
    wing: "Wing I · Table 02",
    title: "Pond Dice · Custom Odds Slider",
    route: "/games/dice",
    stageSelector: ".game-stage",
    initialLine:
      "Slide the win line anywhere from 2 to 98. We'll roll a safe 65% warm-up, then dial a 24% sniper line for a 4.00× payout.",
    initialMood: "focused",
  },
  {
    index: 3,
    code: "04",
    shortLabel: "Blackjack",
    wing: "Wing I · Table 03",
    title: "Single-Deck Blackjack · Double to 21",
    route: "/games/blackjack",
    stageSelector: ".game-stage",
    initialLine:
      "Single-deck rules, dealer stands on 17, naturals pay 3:2, and the entire 52-card shoe is SHA-256 committed before the deal.",
    initialMood: "focused",
  },
  {
    index: 4,
    code: "05",
    shortLabel: "60 Hz Hopper",
    wing: "Wing I · Free Skill Arcade",
    title: "Hopper · Full Road Crossing",
    route: "/games/hopper",
    stageSelector: ".game-stage",
    initialLine:
      "Free arcade episodes run a deterministic 60 Hz simulation. Watch the frog thread all 10 lanes into the top goal verge!",
    initialMood: "focused",
  },
  {
    index: 5,
    code: "06",
    shortLabel: "Frogris",
    wing: "Wing I · Free Skill Arcade",
    title: "Frogris · 60 Hz Falling Blocks",
    route: "/games/frogris",
    stageSelector: ".game-stage",
    initialLine:
      "Every rotation, shift, and hard-drop in Frogris is recorded at frame boundaries and replayed on the server to verify scores.",
    initialMood: "focused",
  },
  {
    index: 6,
    code: "07",
    shortLabel: "Worm Frog",
    wing: "Wing I · Free Skill Arcade",
    title: "Worm Frog · Fly-Hunting Serpent",
    route: "/games/worm",
    stageSelector: ".game-stage",
    initialLine:
      "Steer the serpent across the grid — each fly scores +10 and speeds up the pace. Top weekly runs share the $OWP bounty pool.",
    initialMood: "focused",
  },
  {
    index: 7,
    code: "08",
    shortLabel: "Board & Bid",
    wing: "Wings II & III · Board & Gavel",
    title: "Homepage Bounty Board & Auction Bid",
    route: "/",
    stageSelector: "#owp-bounty-board",
    initialLine:
      "Our 3× Frog Flip streak just filled the weekly Flip pot on the Homepage Bounty Board — next, we'll place an escrowed bid in Wing II.",
    initialMood: "impressed",
  },
  {
    index: 8,
    code: "09",
    shortLabel: "Withdraw & Vault",
    wing: "Ledger · Proof · Treasury",
    title: "Payout Withdrawal, Fairness & Vault",
    route: "/account",
    stageSelector: "main",
    initialLine:
      "Everything settles inside the Account Ledger — bounties, bids, and table winnings. Let's withdraw our available $OWP, verify proofs, and unlock the Vault.",
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
   Featuring a live 60fps 3D Portal Vortex Canvas + 9 Station Jumpers
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
    const H = 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const stars = Array.from({ length: 44 }, (_, i) => ({
      angle: (i / 44) * Math.PI * 2 + (i % 5) * 0.3,
      z: (i / 44) * 1,
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
      const bgGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 132);
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
        const rx = 18 + scale * 122;
        const ry = 12 + scale * 80;
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
        const px = cx + Math.cos(s.angle) * (14 + depth * 126);
        const py = cy + Math.sin(s.angle) * (10 + depth * 82);
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
        className="block w-full h-[196px] sm:h-[216px] object-cover"
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between text-[0.65rem] mono uppercase tracking-wider">
        <span className="px-2 py-0.5 rounded bg-abyss/80 text-neon border border-white/10">
          Live Co-Pilot · 60 FPS
        </span>
        <span className="px-2 py-0.5 rounded bg-abyss/80 text-gold border border-white/10">
          9 Live Chapters
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
                Interactive Grand House Tour
              </span>
              <span className="text-xs mono text-fog/70">
                · Opt-in · Plays all 6 games &amp; all 3 wings live
              </span>
            </div>

            <h2 className="display text-2xl sm:text-3xl text-frost tracking-tight mb-2.5">
              Enter the <span className="neon-text">Other World.</span>
            </h2>

            <p className="text-fog text-sm sm:text-base leading-relaxed max-w-2xl mb-5">
              Let the House Croupier take the wheel for a complete live-house
              simulation — funding an in-memory{" "}
              <span className="text-frost">$OWP balance</span>, filling a{" "}
              <span className="text-gold">bounty pool to payout</span> on{" "}
              <span className="text-frost">Frog Flip</span>, sniping{" "}
              <span className="text-gold">4.00×</span> on{" "}
              <span className="text-frost">Pond Dice</span>, doubling to 21 in{" "}
              <span className="text-frost">Blackjack</span>, playing{" "}
              <span className="text-frost">Hopper</span>,{" "}
              <span className="text-frost">Frogris</span> &amp;{" "}
              <span className="text-frost">Worm Frog</span>, bidding on a live
              auction lot, withdrawing winnings, and opening the{" "}
              <span className="text-frost">Vault Doors</span> onto all three wings.
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
                Or jump straight to any of the 9 live stations:
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
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const [active, setActive] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [line, setLine] = useState(CHAPTERS[0].initialLine);
  const [mood, setMood] = useState<Mood>(CHAPTERS[0].initialMood);
  const [stepProgress, setStepProgress] = useState(0);
  const [vaultPhase, setVaultPhase] = useState<VaultPhase>("idle");

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
    stopTourSim();
    setActive(false);
    setCompleted(false);
    setPaused(false);
    setVaultPhase("idle");
    cursorTargetElRef.current = null;
    if (typeof document !== "undefined") {
      document.documentElement.removeAttribute("data-owp-tour");
    }
    cleanupStageAttributes();
  }, [cleanupStageAttributes]);

  const finishTourToFinale = useCallback(() => {
    runIdRef.current += 1;
    stopTourSim();
    cursorTargetElRef.current = null;
    if (typeof document !== "undefined") {
      document.documentElement.removeAttribute("data-owp-tour");
    }
    cleanupStageAttributes();
    setVaultPhase("idle");
    setStepProgress(1);
    setMood("excited");
    setLine(
      "The vault is open — three wings, one treasury. You've funded a wallet, swept a bounty pot, bid on a lot, withdrawn winnings, and verified the proof. Where would you like to start?"
    );
    setCompleted(true);
  }, [cleanupStageAttributes]);

  const startTour = useCallback((startChapter = 0) => {
    const idx = Math.max(0, Math.min(CHAPTERS.length - 1, startChapter));
    runIdRef.current += 1;
    startTourSim(idx);
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
    setCompleted(false);
    setPaused(false);
    setVaultPhase("idle");
    setChapter(idx);
    setLine(CHAPTERS[idx].initialLine);
    setMood(CHAPTERS[idx].initialMood);
    setStepProgress(0.08);
    setActive(true);
  }, []);

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
    if (!active || completed) return;
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

      // Draw subtle corner brackets around active target button/control (skip large containers)
      if (targetRect && targetRect.width < 340 && targetRect.height < 96) {
        const pad = 6;
        const x0 = targetRect.left - pad;
        const y0 = targetRect.top - pad;
        const x1 = targetRect.right + pad;
        const y1 = targetRect.bottom + pad;
        const cLen = Math.min(10, targetRect.height * 0.35);

        ctx.strokeStyle = "oklch(0.82 0.12 150 / 0.78)";
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
  }, [active, completed]);

  // Single-owner async/await choreography runner
  useEffect(() => {
    if (!active || completed) return;

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
      let partialMatch: HTMLElement | null = null;
      for (const el of candidates) {
        if (el.closest("[data-owp-dock]")) continue;
        if (el.hasAttribute("data-owp-trigger")) continue;
        const label = (el.textContent || "").trim().toLowerCase();
        if (label === needle) return el;
        if (!partialMatch && label.includes(needle)) partialMatch = el;
      }
      return partialMatch;
    };

    const waitForButtonByText = async (
      textSnippet: string,
      root: ParentNode = document,
      timeoutMs = 3600
    ): Promise<HTMLElement | null> => {
      let waited = 0;
      while (waited < timeoutMs) {
        if (isCancelled()) return null;
        const found = findButtonByText(textSnippet, root);
        if (found && !found.hasAttribute("disabled")) return found;
        await new Promise((r) => setTimeout(r, 60));
        waited += 60;
      }
      return findButtonByText(textSnippet, root);
    };

    const scrollElementIntoComfortZone = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const targetScrollY = Math.max(
        0,
        window.scrollY +
          rect.top -
          Math.max(76, (window.innerHeight - Math.min(rect.height, 560)) * 0.34)
      );
      window.scrollTo({ top: targetScrollY, behavior: "smooth" });
    };

    const aimAndClick = async (
      el: HTMLElement | null,
      waitBeforeClickMs = 540,
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
        routerRef.current.push(route);
      }
      for (let i = 0; i < 100; i++) {
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
      setVaultPhase("idle");
      setLine(meta.initialLine);
      setMood(meta.initialMood);
      setStepProgress(0.1);

      const stageEl = await waitForRouteAndStage(meta.route, meta.stageSelector);
      if (!stageEl || isCancelled()) return;

      stageEl.setAttribute("data-owp-stage", "active");
      scrollElementIntoComfortZone(stageEl);
      cursorTargetElRef.current = stageEl;
      if (!(await sleep(550))) return;

      if (chapter === 0) {
        // CHAPTER 01: Buy $OWP Desk + Three Wings (/)
        setStepProgress(0.26);
        const presetHalfSol =
          findButtonByText("0.5 sol", stageEl) || findButtonByText("0.1 sol", stageEl);
        if (presetHalfSol) {
          setLine(
            "Select 0.5 SOL on the Buy $OWP desk — watch our simulated wallet & house ledger right up in the navbar."
          );
          setMood("focused");
          await aimAndClick(presetHalfSol, 520, true);
        }
        if (!(await sleep(520))) return;

        setStepProgress(0.5);
        const buyBtn = await waitForButtonByText("buy", stageEl, 2200);
        if (buyBtn) {
          setLine("Filling the order — instant $OWP added directly to our simulated balance!");
          setMood("excited");
          await aimAndClick(buyBtn, 560, true);
        }
        if (!(await sleep(1050))) return;

        // Scroll to the Three Wings grid
        setStepProgress(0.78);
        const wingsGrid = document.getElementById("owp-wings");
        const firstWingLink =
          wingsGrid?.querySelector<HTMLElement>("a.lot-card") ||
          findButtonByText("view lots", document);
        if (firstWingLink) {
          scrollElementIntoComfortZone(wingsGrid || firstWingLink);
          if (!(await sleep(480))) return;
          setLine(
            "Three interconnected wings — The Arcade, The Auction House, and The Bounty Board — all settle from one balance."
          );
          setMood("impressed");
          await aimAndClick(firstWingLink, 680, false);
        }
        if (!(await sleep(1200))) return;
      } else if (chapter === 1) {
        // CHAPTER 02: Frog Flip (/games/flip) — Live 3x Streak, Bounty Pot Fill & Cash Out
        setStepProgress(0.2);

        const frogSideBtn = await waitForButtonByText("frog", stageEl, 2000);
        if (frogSideBtn) {
          await aimAndClick(frogSideBtn, 420, true);
        }

        setStepProgress(0.38);
        const flipBtn = await waitForButtonByText("flip it", stageEl, 2500);
        if (flipBtn) {
          setLine("Calling 🐸 Frog with 500 $OWP — watch both the navbar balance and bounty meter move!");
          setMood("focused");
          await aimAndClick(flipBtn, 560, true);
        }

        // Wait for Double or Nothing button after Win #1
        const doubleBtn1 = await waitForButtonByText("double or nothing", stageEl, 3500);
        setStepProgress(0.6);
        if (doubleBtn1) {
          setLine("First flip landed Frog! Pressing the pot with Double or Nothing for a 2× streak.");
          setMood("excited");
          await aimAndClick(doubleBtn1, 640, true);
        }

        // Wait for Double or Nothing button after Win #2 -> Win #3 fills 100% of the Flip bounty pot!
        const doubleBtn2 = await waitForButtonByText("double or nothing", stageEl, 3500);
        setStepProgress(0.8);
        if (doubleBtn2) {
          setLine("🔥 2 in a row! One more press completes the weekly Frog Flip bounty pool!");
          setMood("excited");
          await aimAndClick(doubleBtn2, 640, true);
        }

        // Wait for Cash Out button after Win #3 and bank the pot + bounty payout!
        const cashOutBtn = await waitForButtonByText("cash out", stageEl, 3500);
        setStepProgress(0.94);
        if (cashOutBtn) {
          setLine(
            "🎯 3× streak AND the Flip Bounty Pool hit 100% — Cashing Out locks the table win + +1,850 $OWP prize!"
          );
          setMood("impressed");
          await aimAndClick(cashOutBtn, 720, true);
        }
        if (!(await sleep(1550))) return;
      } else if (chapter === 2) {
        // CHAPTER 03: Pond Dice (/games/dice) — 65% Safe Roll + 24% 4.00x Sniper Roll
        setStepProgress(0.2);

        const slider = stageEl.querySelector<HTMLInputElement>("input[type='range']");
        if (slider) {
          cursorTargetElRef.current = slider;
          setLine("First, let's set a wide 65% win zone (1.48× multiplier) for a warm-up live roll.");
          setMood("focused");
          for (const val of [55, 60, 65]) {
            if (!(await sleep(160))) return;
            window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: val }));
          }
          spawnClickBurst(slider);
        }

        const rollBtn1 = await waitForButtonByText("roll", stageEl, 2500);
        setStepProgress(0.45);
        if (rollBtn1) {
          await aimAndClick(rollBtn1, 520, true);
        }
        if (!(await sleep(1100))) return;

        // Second roll: tighten slider to 24% for a 4.00x multiplier!
        setStepProgress(0.68);
        if (slider) {
          cursorTargetElRef.current = slider;
          setLine("Clean win! Now watch me tighten the target line to 24% for a 4.00× payout multiplier.");
          setMood("excited");
          for (const val of [48, 34, 24]) {
            if (!(await sleep(170))) return;
            window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: val }));
          }
          spawnClickBurst(slider);
        }

        const rollBtn2 = await waitForButtonByText("roll", stageEl, 2500);
        setStepProgress(0.88);
        if (rollBtn2) {
          setLine("Rolling under 24 for a 4.00× hit…");
          await aimAndClick(rollBtn2, 560, true);
        }
        if (!(await sleep(1250))) return;
        setLine("Boom — 4.00× landed inside the green zone and fed the Dice bounty pool!");
        setMood("excited");
        if (!(await sleep(1100))) return;
      } else if (chapter === 3) {
        // CHAPTER 04: Single-Deck Blackjack (/games/blackjack) — Deal + Double to 21!
        setStepProgress(0.25);

        const dealBtn = await waitForButtonByText("deal", stageEl, 2500);
        if (dealBtn) {
          setLine("Dealing a live hand of single-deck Blackjack on the etched emerald felt…");
          setMood("focused");
          await aimAndClick(dealBtn, 580, true);
        }

        if (!(await sleep(900))) return;
        setStepProgress(0.65);
        const doubleBtn =
          (await waitForButtonByText("double", stageEl, 2500)) ||
          findButtonByText("hit", stageEl);
        if (doubleBtn) {
          setLine(
            "We hold 12 against the dealer's 6 — let's Double Down to draw one card for 21!"
          );
          setMood("excited");
          await aimAndClick(doubleBtn, 680, true);
        }

        if (!(await sleep(1100))) return;
        setStepProgress(0.92);
        setLine(
          "21 on the felt and the dealer busts at 24 — doubled payout banked! Every 52-card shoe is verifiable."
        );
        setMood("excited");
        if (!(await sleep(1400))) return;
      } else if (chapter === 4) {
        // CHAPTER 05: 60 Hz Hopper (/games/hopper) — Full Road Crossing!
        setStepProgress(0.25);
        const startBtn =
          (await waitForButtonByText("start hopping", stageEl, 2500)) ||
          findButtonByText("hop again", stageEl);
        if (startBtn) {
          setLine("Starting 60 Hz Hopper — watch our lookahead autopilot dodge cars across all 10 lanes!");
          setMood("focused");
          await aimAndClick(startBtn, 540, true);
        }

        const canvasEl = stageEl.querySelector<HTMLElement>("canvas");
        if (canvasEl) {
          cursorTargetElRef.current = canvasEl;
        }

        if (!(await sleep(2400))) return;
        setStepProgress(0.65);
        setLine(
          "Halfway across at the safe median — now threading the upper lanes toward the +10 goal verge!"
        );
        setMood("excited");
        if (!(await sleep(2800))) return;
        setStepProgress(0.95);
        setLine("Full crossing completed! Server replay verifies every hop frame-by-frame.");
        setMood("impressed");
        if (!(await sleep(900))) return;
      } else if (chapter === 5) {
        // CHAPTER 06: Frogris (/games/frogris) — 60 Hz Falling Blocks!
        setStepProgress(0.25);
        const startBtn =
          (await waitForButtonByText("start", stageEl, 2500)) ||
          findButtonByText("play again", stageEl);
        if (startBtn) {
          setLine("Launching 60 Hz Frogris — watch the co-pilot rotate, align, and hard-drop glossy blocks!");
          setMood("focused");
          await aimAndClick(startBtn, 540, true);
        }

        const canvasEl = stageEl.querySelector<HTMLElement>("canvas");
        if (canvasEl) {
          cursorTargetElRef.current = canvasEl;
        }

        if (!(await sleep(2300))) return;
        setStepProgress(0.68);
        setLine(
          "Every piece is seeded from the signed run token — ghost outlines show the exact landing slot."
        );
        setMood("excited");
        if (!(await sleep(2500))) return;
      } else if (chapter === 6) {
        // CHAPTER 07: Worm Frog (/games/worm) — Fly-Hunting Serpent!
        setStepProgress(0.25);
        const startBtn =
          (await waitForButtonByText("start slithering", stageEl, 2500)) ||
          findButtonByText("slither again", stageEl);
        if (startBtn) {
          setLine("Launching Worm Frog — watch the serpent lock onto flies across the checkerboard well!");
          setMood("focused");
          await aimAndClick(startBtn, 540, true);
        }

        const canvasEl = stageEl.querySelector<HTMLElement>("canvas");
        if (canvasEl) {
          cursorTargetElRef.current = canvasEl;
        }

        if (!(await sleep(2300))) return;
        setStepProgress(0.7);
        setLine(
          "Every fly scores +10 and accelerates the pace — weekly top scores split the $OWP prize pool!"
        );
        setMood("excited");
        if (!(await sleep(2500))) return;
      } else if (chapter === 7) {
        // CHAPTER 08: Homepage Bounty Board (/#owp-bounty-board) -> Auction House Bid
        setStepProgress(0.18);
        const boardLedger =
          document.getElementById("owp-bounty-board-ledger") || stageEl;
        scrollElementIntoComfortZone(boardLedger);
        const awardRow = stageEl.querySelector<HTMLElement>(
          "[data-owp-sim-award='1']"
        );
        if (awardRow) {
          cursorTargetElRef.current = awardRow;
          setLine(
            "Right here on the Homepage Bounty Board — the Frog Flip pool hit 100%, settled to 1st place, and +1,850 $OWP landed in our balance!"
          );
          setMood("excited");
          if (!(await sleep(750))) return;
          spawnClickBurst(awardRow);
        } else {
          setLine(
            "Every wagered game and arcade run feeds the Homepage Bounty Board live, filling fixed $OWP prize pots automatically."
          );
          setMood("focused");
        }
        if (!(await sleep(1300))) return;

        // Now visit Wing II: The Auction House (/auctions) and place a real-art simulated bid!
        setStepProgress(0.45);
        setLine(
          "Now crossing into Wing II — The Auction House, where escrowed $OWP bids and two-minute anti-snipe rules protect every lot."
        );
        setMood("impressed");
        const auctionStage = await waitForRouteAndStage("/auctions", "main");
        if (!auctionStage || isCancelled()) return;
        auctionStage.setAttribute("data-owp-stage", "active");
        if (!(await sleep(650))) return;

        const targetLotCard =
          auctionStage.querySelector<HTMLElement>(
            "a[data-owp-lot='sim-lot-croupier-plush']"
          ) || auctionStage.querySelector<HTMLElement>("a.lot-card");
        setStepProgress(0.62);
        if (targetLotCard) {
          scrollElementIntoComfortZone(targetLotCard);
          setLine(
            "Let's open the Croupier Frog Desk Plushie lot and put down a competitive live bid."
          );
          setMood("focused");
          await aimAndClick(targetLotCard, 620, true);
        }

        const lotDetailStage = await waitForRouteAndStage(
          "/auctions/sim-lot-croupier-plush",
          "main"
        );
        if (lotDetailStage && !isCancelled()) {
          lotDetailStage.setAttribute("data-owp-stage", "active");
          const plus10Btn = await waitForButtonByText("+10%", lotDetailStage, 2600);
          if (plus10Btn) {
            scrollElementIntoComfortZone(plus10Btn);
            setLine("Bump our opening offer by +10% above the current high bid…");
            await aimAndClick(plus10Btn, 560, true);
          }
          if (!(await sleep(420))) return;

          setStepProgress(0.86);
          const bidBtn = await waitForButtonByText("place bid", lotDetailStage, 2600);
          if (bidBtn) {
            setLine("Locking 1,320 $OWP into escrow — bid placed and leading the lot!");
            setMood("excited");
            await aimAndClick(bidBtn, 600, true);
          }
          if (!(await sleep(1300))) return;
        }
      } else if (chapter === 8) {
        // CHAPTER 09: Account Ledger Withdrawal (/account) -> Fairness (/fairness) -> Treasury -> Vault Finale
        setStepProgress(0.14);
        stageEl.setAttribute("data-owp-stage", "active");
        setLine(
          "Your Account Ledger tracks available balance, locked escrow bids, bounty winnings, and payout withdrawals together."
        );
        setMood("focused");
        if (!(await sleep(1050))) return;

        const withdrawBtn = await waitForButtonByText("withdraw available", stageEl, 3000);
        if (withdrawBtn) {
          scrollElementIntoComfortZone(withdrawBtn);
          setStepProgress(0.28);
          setLine(
            "Clicking Withdraw Available settles your free in-app $OWP straight back into your wallet."
          );
          setMood("excited");
          await aimAndClick(withdrawBtn, 650, true);
          if (!(await sleep(1300))) return;
        }

        // Visit /fairness and run the independent HMAC-SHA256 verifier
        setStepProgress(0.42);
        setLine(
          "Next — Provable Fairness. Every table hand and dice roll can be independently verified in your browser."
        );
        setMood("impressed");
        const fairnessStage = await waitForRouteAndStage("/fairness", "main");
        if (!fairnessStage || isCancelled()) return;
        fairnessStage.setAttribute("data-owp-stage", "active");
        if (!(await sleep(450))) return;

        const randomizeBtn = findButtonByText("randomize", fairnessStage);
        if (randomizeBtn) {
          setLine(
            "Half of every roll is your browser's Client Seed — click Randomize anytime after the House commits."
          );
          setMood("focused");
          await aimAndClick(randomizeBtn, 520, true);
        }
        if (!(await sleep(750))) return;

        const verifierEl = document.getElementById("verifier");
        if (verifierEl) {
          verifierEl.setAttribute("data-owp-stage", "active");
          scrollElementIntoComfortZone(verifierEl);
          window.dispatchEvent(new Event("owp:fairness-demo"));
          if (!(await sleep(450))) return;

          setStepProgress(0.56);
          const recomputeBtn = findButtonByText("recompute roll", verifierEl);
          if (recomputeBtn) {
            setLine(
              "Running the Independent Verifier — computing HMAC-SHA256(serverSeed, clientSeed:nonce)…"
            );
            setMood("excited");
            await aimAndClick(recomputeBtn, 520, true);
          }
          if (!(await sleep(800))) return;

          const deriveBtn = findButtonByText("derive blackjack deck", verifierEl);
          if (deriveBtn) {
            setLine(
              "And re-deriving all 52 cards of the committed Blackjack shoe right here in the browser!"
            );
            await aimAndClick(deriveBtn, 520, true);
          }
          if (!(await sleep(1100))) return;
        }

        // Visit /treasury — the vault that backs the whole house
        setStepProgress(0.7);
        setLine(
          "Finally, The Treasury streams live Solana vault balances, deposits, and automatic prize payouts. Now — let's open the vault."
        );
        setMood("impressed");
        const treasuryStage = await waitForRouteAndStage("/treasury", "main");
        if (!treasuryStage || isCancelled()) return;
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (!(await sleep(2100))) return;

        // GRAND FINALE: vault doors seal over the Treasury, the wheel turns,
        // and they part onto the homepage's Three Wings.
        // Vault timing is NOT pausable (the doors must never hang closed).
        const hold = (ms: number) =>
          new Promise<boolean>((r) => setTimeout(() => r(!isCancelled()), ms));
        const reduceMotion =
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

        setStepProgress(0.82);
        setLine("The vault is unlocking… welcome to the house.");
        setMood("excited");
        cursorTargetElRef.current = null;
        cursorFallbackRef.current = {
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.5,
        };

        if (!reduceMotion) {
          setVaultPhase("closing");
          if (!(await hold(820))) return;
          setVaultPhase("locked");
        }

        // Behind the closed doors: go home and park on the Three Wings
        if (window.location.pathname !== "/") routerRef.current.push("/");
        let wingsEl: HTMLElement | null = null;
        for (let i = 0; i < 120 && !wingsEl; i++) {
          if (isCancelled()) return;
          if (window.location.pathname === "/") {
            wingsEl = document.getElementById("owp-wings");
          }
          if (!wingsEl) await new Promise((r) => setTimeout(r, 50));
        }
        // Let Next.js finish its own scroll-to-top before we park the view
        if (!(await hold(140))) return;
        const parkOnWings = () => {
          if (!wingsEl || !wingsEl.isConnected) return;
          const top = wingsEl.getBoundingClientRect().top + window.scrollY - 124;
          window.scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
        };
        parkOnWings();
        if (!reduceMotion) {
          if (!(await hold(1050))) return;
          parkOnWings();
          setVaultPhase("opening");
          if (!(await hold(1500))) return;
          setVaultPhase("idle");
        }
        if (isCancelled()) return;

        // Present each wing on the real homepage cards
        setStepProgress(0.92);
        if (wingsEl) {
          wingsEl.setAttribute("data-owp-stage", "active");
          const cards = Array.from(
            wingsEl.querySelectorAll<HTMLElement>("a.lot-card")
          ).slice(0, 3);
          const wingLines = [
            "Wing I — The Arcade. Six provably fair games: the ones you just watched me play.",
            "Wing II — The Auction House. Escrowed $OWP bids with anti-snipe closings.",
            "Wing III — The Bounty Board. Fixed $OWP pools that unlock as the games are played.",
          ];
          for (let i = 0; i < cards.length; i++) {
            if (isCancelled()) return;
            setLine(wingLines[i] ?? wingLines[0]);
            setMood(i === 2 ? "excited" : "impressed");
            if (!(await aimAndClick(cards[i], 900, false))) return;
            if (!(await sleep(1100))) return;
          }
        }
      }

      setStepProgress(1);
      if (isCancelled()) return;

      if (chapter < CHAPTERS.length - 1) {
        setChapter((c) => c + 1);
      } else {
        finishTourToFinale();
      }
    };

    runChapter();
  }, [active, chapter, completed, cleanupStageAttributes, finishTourToFinale]);

  if (!active) return null;

  const meta = CHAPTERS[chapter] ?? CHAPTERS[0];

  return (
    <>
      {/* Full-viewport transparent 60fps Comet Cursor & Click Sparks Canvas */}
      {!completed && (
        <canvas
          ref={overlayCanvasRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 w-screen h-screen z-50"
          style={{ width: "100vw", height: "100vh" }}
        />
      )}

      {/* Grand-finale vault doors (reuses the site's vault-intro artwork) */}
      {vaultPhase !== "idle" && (
        <div className="owp-vault" data-phase={vaultPhase} aria-hidden="true">
          <div className="vault-door vault-door--left" />
          <div className="vault-door vault-door--right" />
          <div className="vault-seam" />
          <div className="owp-vault-center">
            <div className="vault-wheel">
              <span className="vault-wheel-ticks owp-vault-ticks" />
              <span className="vault-wheel-ring" />
              <div className="vault-seal">
                <SealMark size={88} />
              </div>
            </div>
            <div className="vault-word">
              <span className="vault-word-main">Three Wings · One Treasury</span>
            </div>
          </div>
        </div>
      )}

      {/* Compact Floating Glass Story Dock — bottom-right, never blocks the site */}
      <aside
        data-owp-dock="1"
        aria-label="Other World Live Co-Pilot"
        className="fixed bottom-4 right-4 z-50 w-[min(92vw,448px)] rounded-2xl border p-4 shadow-2xl transition-all"
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
              <span className="whitespace-nowrap shrink-0">
                {completed ? "Tour Complete · 09 / 09" : `Chapter ${meta.code} / 09`}
              </span>
              <span className="text-fog shrink-0">·</span>
              <span className="text-gold truncate">
                {completed ? "The House Is Yours" : meta.wing}
              </span>
            </div>
            <h3 className="display text-base text-frost truncate">
              {completed ? "Ready to Enter the House" : meta.title}
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

        {completed && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                stopTour();
                routerRef.current.push("/games");
              }}
              className="btn btn-primary !py-1.5 !px-3.5 text-xs"
            >
              Enter the Arcade →
            </button>
            <button
              type="button"
              onClick={() => {
                stopTour();
                routerRef.current.push("/bounties");
              }}
              className="btn btn-ghost !py-1.5 !px-3 text-xs"
            >
              Bounty Board
            </button>
            <button
              type="button"
              onClick={() => startTour(0)}
              className="btn btn-ghost !py-1.5 !px-3 text-xs"
            >
              Replay Tour ↻
            </button>
          </div>
        )}

        {/* Chapter Progress Pills + Transport Controls */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
          <div className="flex items-center gap-1 flex-1">
            {CHAPTERS.map((ch) => {
              const isCurrent = !completed && ch.index === chapter;
              const isDone = completed || ch.index < chapter;
              return (
                <button
                  key={ch.code}
                  type="button"
                  onClick={() => {
                    if (completed) {
                      startTour(ch.index);
                    } else {
                      startTourSim(ch.index);
                      setPaused(false);
                      setChapter(ch.index);
                    }
                  }}
                  title={`${ch.code} · ${ch.shortLabel}`}
                  className="group relative h-6 flex-1 rounded-md border overflow-hidden transition-all text-[0.58rem] mono"
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
              disabled={chapter === 0 && !completed}
              onClick={() => {
                if (completed) {
                  startTour(CHAPTERS.length - 1);
                } else {
                  setChapter((c) => Math.max(0, c - 1));
                }
              }}
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
                if (!completed && chapter < CHAPTERS.length - 1) {
                  setChapter((c) => c + 1);
                } else {
                  finishTourToFinale();
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
