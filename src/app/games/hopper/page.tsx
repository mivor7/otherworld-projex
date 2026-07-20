"use client";

// Hopper — the lane-crossing episode. The page drives the SAME deterministic
// 60 Hz simulation the server verifies (src/lib/hopper-sim.ts): the run token
// seeds the traffic, hops are applied at frame boundaries (one per frame) and
// recorded, and the trace is submitted with the score for server replay.
// Scoring is progress-based — only a new deepest row on the current crossing
// pays, so bouncing on safe rows earns nothing.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { ArcadeBountyHeader } from "@/components/arcade-bounty-header";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { AmbientPond } from "@/components/ambient-pond";
import { useHouseConfig } from "@/components/use-house-config";
import { ARCADE, CAR_COLORS } from "@/lib/arcade-palette";
import {
  HROWS,
  HCELL,
  HW,
  HFRAME_MS,
  type HInput,
  type HopperState,
  createHopper,
  hopperHop,
  hopperFrame,
} from "@/lib/hopper-sim";
import { seedFromToken } from "@/lib/worm-sim";

const W = HW;
const H = HROWS * HCELL;

export default function HopperPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HopperState | null>(null);
  // Attract mode: local traffic cruising behind the start overlay so the
  // board is never a dead black box. Never recorded, never submitted.
  const attractRef = useRef<HopperState | null>(null);
  const queueRef = useRef<number[]>([]);
  const traceRef = useRef<HInput[]>([]);
  const runTokenRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<Promise<void> | null>(null);
  const submittedRef = useRef(false);
  const overAtRef = useRef(0);
  const [hud, setHud] = useState({
    score: 0, lives: 3, level: 0, over: true, started: false, seconds: 0,
  });
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const spritesRef = useRef<{ frog?: HTMLImageElement }>({});

  // Preload the player frog sprite (painted fallback until it loads).
  useEffect(() => {
    const img = new Image();
    img.src = "/art/owp_hopper_frog.png";
    spritesRef.current = { frog: img };
  }, []);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const house = useHouseConfig();

  const loadBoard = useCallback(() => {
    fetch("/api/leaderboard?game=hopper")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setBoard(rows))
      .catch(() => {});
  }, []);
  useEffect(loadBoard, [loadBoard]);

  const submitScore = useCallback(
    (score: number, trace: HInput[]) => {
      if (!runTokenRef.current || score <= 0) return;
      const token = runTokenRef.current;
      runTokenRef.current = null;
      pendingSubmitRef.current = (async () => {
        const res = await fetch("/api/arcade/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runToken: token, score, trace }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          setSubmitMsg(
            data.ranked
              ? `Score ${score} posted to the leaderboard — replay verified.`
              : `Score ${score} verified & saved — unranked. Prize boards need ${house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT spent on credits lifetime and ${house.rankedMinWindowBurnedRibbit.toLocaleString()}+ inside the board week.`
          );
          loadBoard();
        } else {
          setSubmitMsg(`Score ${score} not submitted — ${data?.error ?? "connection lost"}.`);
        }
      })().catch(() =>
        setSubmitMsg(`Score ${score} not submitted — connection lost.`)
      );
    },
    [loadBoard, house]
  );

  const start = useCallback(async () => {
    setSubmitMsg(null);
    if (pendingSubmitRef.current) {
      await pendingSubmitRef.current.catch(() => {});
      pendingSubmitRef.current = null;
    }
    runTokenRef.current = null;
    if (me.signedIn) {
      try {
        const res = await fetch("/api/arcade/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: "hopper" }),
        });
        const data = await res.json();
        runTokenRef.current = data.runToken ?? null;
        if (!runTokenRef.current) {
          setSubmitMsg(`Playing unranked — ${data.error ?? "ranked runs unavailable right now"}.`);
        }
      } catch {
        runTokenRef.current = null;
        setSubmitMsg("Playing unranked — couldn't reach the house.");
      }
    }
    const seed = runTokenRef.current
      ? seedFromToken(runTokenRef.current)
      : (Math.random() * 2 ** 31) | 0;
    gameRef.current = createHopper(seed);
    queueRef.current = [];
    traceRef.current = [];
    submittedRef.current = false;
    overAtRef.current = 0;
  }, [me.signedIn]);

  const enqueue = useCallback((d: number) => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (queueRef.current.length < 4) queueRef.current.push(d);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = {
        ArrowUp: 0, w: 0,
        ArrowDown: 1, s: 1,
        ArrowLeft: 2, a: 2,
        ArrowRight: 3, d: 3,
      };
      if (map[e.key] !== undefined) {
        e.preventDefault();
        enqueue(map[e.key]);
      }
      if (e.key === " " && (!gameRef.current || gameRef.current.over)) {
        e.preventDefault();
        if (overAtRef.current && performance.now() - overAtRef.current < 700) return;
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enqueue, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    // HiDPI: render at device resolution, draw in logical pixels.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    if (!attractRef.current) {
      attractRef.current = createHopper((Math.random() * 2 ** 31) | 0);
    }

    const tick = (now: number) => {
      let g = gameRef.current;

      // Fixed-step sim — identical on every display refresh rate.
      if (g && !g.over) {
        acc += now - last;
        if (acc > 250) acc = 250;
        while (acc >= HFRAME_MS && !g.over) {
          acc -= HFRAME_MS;
          if (queueRef.current.length > 0) {
            const d = queueRef.current.shift()!;
            traceRef.current.push({ f: g.frame, d });
            hopperHop(g, d);
          }
          hopperFrame(g);
        }
        if (g.over && !submittedRef.current) {
          submittedRef.current = true;
          overAtRef.current = performance.now();
          submitScore(g.score, traceRef.current);
        }
      } else if (!g || g.over) {
        // idle: keep the attract traffic flowing (frog waits on the verge)
        const a = attractRef.current!;
        acc += now - last;
        if (acc > 250) acc = 250;
        while (acc >= HFRAME_MS) {
          acc -= HFRAME_MS;
          hopperFrame(a);
        }
        if (!g) g = a;
      }
      last = now;

      // ——— render ———
      const nowMs = performance.now();
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      const isSafeRow = (r: number) =>
        r === 0 || r === HROWS - 1 || r === Math.floor(HROWS / 2);
      for (let r = 0; r < HROWS; r++) {
        const isSafe = isSafeRow(r);
        if (isSafe) {
          const verge = ctx.createLinearGradient(0, r * HCELL, 0, (r + 1) * HCELL);
          verge.addColorStop(0, "oklch(0.78 0.11 150 / 0.1)");
          verge.addColorStop(1, "oklch(0.78 0.11 150 / 0.05)");
          ctx.fillStyle = verge;
          ctx.fillRect(0, r * HCELL, W, HCELL - 1);
        } else {
          const tarmac = ctx.createLinearGradient(0, r * HCELL, 0, (r + 1) * HCELL);
          tarmac.addColorStop(0, "rgba(255,255,255,0.035)");
          tarmac.addColorStop(0.5, "rgba(255,255,255,0.015)");
          tarmac.addColorStop(1, "rgba(0,0,0,0.06)");
          ctx.fillStyle = tarmac;
          ctx.fillRect(0, r * HCELL, W, HCELL - 1);
          // lane dashes
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.setLineDash([10, 14]);
          ctx.beginPath();
          ctx.moveTo(0, r * HCELL + HCELL / 2);
          ctx.lineTo(W, r * HCELL + HCELL / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // curbs where road meets a safe verge
          ctx.fillStyle = "oklch(0.78 0.11 150 / 0.14)";
          if (isSafeRow(r - 1)) ctx.fillRect(0, r * HCELL, W, 2);
          if (isSafeRow(r + 1)) ctx.fillRect(0, (r + 1) * HCELL - 3, W, 2);
        }
      }
      // goal row shimmer — a slow light band drifting across
      const bandX = ((nowMs / 26) % (W + 220)) - 110;
      const shimmer = ctx.createLinearGradient(bandX - 90, 0, bandX + 90, 0);
      shimmer.addColorStop(0, "rgba(255,255,255,0)");
      shimmer.addColorStop(0.5, "oklch(0.85 0.09 150 / 0.07)");
      shimmer.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, W, HCELL - 1);

      ctx.fillStyle = ARCADE.limeFaint;
      ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
      ctx.fillText("GOAL +10", 10, HCELL - 17);
      if (g && g.level > 0) {
        ctx.textAlign = "right";
        ctx.fillText(`WAVE ${g.level + 1}`, W - 10, HCELL - 17);
        ctx.textAlign = "left";
      }

      if (g) {
        g.cars.forEach((car, i) => {
          const color = CAR_COLORS[(car.lane + i) % CAR_COLORS.length];
          const cy = car.lane * HCELL;
          const bodyY = cy + 8;
          const bodyH = HCELL - 17;
          // ground shadow
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.roundRect(car.x + 2, bodyY + 4, car.len, bodyH, 7);
          ctx.fill();
          // body with vertical sheen
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(car.x, bodyY, car.len, bodyH, 7);
          ctx.fill();
          const sheen = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
          sheen.addColorStop(0, "rgba(255,255,255,0.22)");
          sheen.addColorStop(0.45, "rgba(255,255,255,0.02)");
          sheen.addColorStop(1, "rgba(0,0,0,0.22)");
          ctx.fillStyle = sheen;
          ctx.beginPath();
          ctx.roundRect(car.x, bodyY, car.len, bodyH, 7);
          ctx.fill();
          // glass cabin toward the front
          const fwd = car.speed > 0;
          const cabinW = Math.min(car.len * 0.34, 30);
          const cabinX = fwd
            ? car.x + car.len - cabinW - 8
            : car.x + 8;
          ctx.fillStyle = "rgba(6,12,10,0.55)";
          ctx.beginPath();
          ctx.roundRect(cabinX, bodyY + 4, cabinW, bodyH - 8, 4);
          ctx.fill();
          // headlights (front) & taillights (rear)
          const frontX = fwd ? car.x + car.len - 3.5 : car.x + 3.5;
          const rearX = fwd ? car.x + 3.5 : car.x + car.len - 3.5;
          ctx.fillStyle = "oklch(0.92 0.05 95 / 0.85)";
          ctx.beginPath();
          ctx.arc(frontX, bodyY + 5, 1.8, 0, 7);
          ctx.arc(frontX, bodyY + bodyH - 5, 1.8, 0, 7);
          ctx.fill();
          ctx.fillStyle = "oklch(0.55 0.16 25 / 0.85)";
          ctx.beginPath();
          ctx.arc(rearX, bodyY + 5, 1.6, 0, 7);
          ctx.arc(rearX, bodyY + bodyH - 5, 1.6, 0, 7);
          ctx.fill();
        });

        // Frog — drawn, not an emoji: consistent everywhere, and it can
        // squash-and-stretch on the hop.
        const sinceHop = g.frame - g.lastHopFrame;
        const hopT = sinceHop < 6 ? Math.sin((sinceHop / 6) * Math.PI) : 0;
        const fx2 = g.frog.col * HCELL + HCELL / 2;
        const fy2 = g.frog.row * HCELL + HCELL / 2 + 1;
        // ground shadow shrinks mid-hop
        ctx.fillStyle = `rgba(0,0,0,${0.32 - hopT * 0.14})`;
        ctx.beginPath();
        ctx.ellipse(fx2, fy2 + 11, 11 - hopT * 3, 3.6, 0, 0, 7);
        ctx.fill();
        ctx.save();
        ctx.translate(fx2, fy2 - hopT * 5);
        ctx.scale(1 + hopT * 0.08, 1 + hopT * 0.14);
        const frogSprite = spritesRef.current.frog;
        if (frogSprite?.complete && frogSprite.naturalWidth) {
          const d = HCELL + 6;
          ctx.drawImage(frogSprite, -d / 2, -d / 2, d, d);
        } else {
          // painted fallback
          ctx.fillStyle = "oklch(0.55 0.1 150)";
          ctx.beginPath();
          ctx.ellipse(-9.5, 6, 5, 7.5, -0.5, 0, 7);
          ctx.ellipse(9.5, 6, 5, 7.5, 0.5, 0, 7);
          ctx.fill();
          const bodyGrad = ctx.createRadialGradient(0, -4, 2, 0, 0, 13);
          bodyGrad.addColorStop(0, "oklch(0.83 0.1 150)");
          bodyGrad.addColorStop(0.7, "oklch(0.68 0.11 150)");
          bodyGrad.addColorStop(1, "oklch(0.5 0.09 150)");
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.ellipse(0, 1, 10.5, 11.5, 0, 0, 7);
          ctx.fill();
          ctx.fillStyle = "oklch(0.9 0.05 150 / 0.35)";
          ctx.beginPath();
          ctx.ellipse(0, 5, 6, 5, 0, 0, 7);
          ctx.fill();
          for (const sideX of [-5.5, 5.5]) {
            ctx.fillStyle = "oklch(0.72 0.1 150)";
            ctx.beginPath();
            ctx.arc(sideX, -9, 4.2, 0, 7);
            ctx.fill();
            ctx.fillStyle = "oklch(0.97 0.003 270)";
            ctx.beginPath();
            ctx.arc(sideX, -9.5, 2.6, 0, 7);
            ctx.fill();
            ctx.fillStyle = ARCADE.ink;
            ctx.beginPath();
            ctx.arc(sideX, -10, 1.3, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = "oklch(0.6 0.1 150)";
          ctx.beginPath();
          ctx.ellipse(-6, 10, 3, 2, 0, 0, 7);
          ctx.ellipse(6, 10, 3, 2, 0, 0, 7);
          ctx.fill();
        }
        ctx.restore();

        // Brief danger flash on a lost life.
        if (g.frame - g.lastDeathFrame < 12 && !g.over) {
          const t = 1 - (g.frame - g.lastDeathFrame) / 12;
          ctx.fillStyle = `oklch(0.64 0.18 25 / ${(t * 0.22).toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }

        const real = gameRef.current;
        if (real) {
          setHud((h) => {
            const seconds = Math.floor((real.frame * HFRAME_MS) / 1000);
            return h.score !== real.score || h.lives !== real.lives || h.over !== real.over ||
              h.level !== real.level || h.seconds !== seconds || !h.started
              ? { score: real.score, lives: real.lives, level: real.level, over: real.over, started: true, seconds }
              : h;
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [submitScore]);

  const mmss = `${Math.floor(hud.seconds / 60)}:${String(hud.seconds % 60).padStart(2, "0")}`;

  return (
    <div className="pt-10 max-w-4xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        kicker="Wing I — free arcade"
        title="Hopper"
        desc="Arrows / WASD to hop. +1 for every new row of progress, +10 per crossing, three lives — each crossing brings faster traffic. Runs are replayed and verified on the server."
      />
      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="panel panel-glow game-stage p-4 flex flex-col items-center">
          <AmbientPond />
          <div className="flex gap-7 mb-3 items-baseline">
            <span className="kicker !text-[0.6rem]">
              Score <span className="stat-number text-neon text-sm ml-1.5">{hud.score}</span>
            </span>
            <span className="kicker !text-[0.6rem]">
              Wave <span className="stat-number text-portal text-sm ml-1.5">{hud.level + 1}</span>
            </span>
            <span className="kicker !text-[0.6rem]">
              Lives{" "}
              <span className="stat-number text-sm ml-1.5 tracking-widest">
                <span className="text-neon">{"●".repeat(Math.max(0, hud.lives))}</span>
                <span style={{ color: "var(--text-dim)" }}>
                  {"○".repeat(Math.max(0, 3 - hud.lives))}
                </span>
              </span>
            </span>
          </div>
          <div className="relative w-full max-w-[396px]">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="w-full rounded-lg border"
              style={{ borderColor: "var(--hairline-strong)" }}
            />
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{ boxShadow: "inset 0 0 42px oklch(0 0 0 / 0.5)" }}
            />
            {hud.over && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-abyss/85 rounded-lg">
                {hud.started && hud.score > 0 && (
                  <div className="text-center mb-4">
                    <div className="stat-number text-2xl text-neon mb-2">{hud.score} pts</div>
                    <div className="text-xs space-x-3" style={{ color: "var(--text-dim)" }}>
                      <span>wave {hud.level + 1}</span>
                      <span>{mmss}</span>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary text-lg px-10 py-3" onClick={start}>
                  {hud.started && hud.score > 0 ? "Hop again" : "Start hopping"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-6 text-center">
                    Practice run — sign in and spend $RIBBIT on credits to compete for prizes.
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Mobile controls */}
          <div className="grid grid-cols-3 gap-2 mt-4 sm:hidden">
            <div />
            <button className="btn btn-ghost" onClick={() => enqueue(0)}>↑</button>
            <div />
            <button className="btn btn-ghost" onClick={() => enqueue(2)}>←</button>
            <button className="btn btn-ghost" onClick={() => enqueue(1)}>↓</button>
            <button className="btn btn-ghost" onClick={() => enqueue(3)}>→</button>
          </div>
          {submitMsg && (
            <div className="mt-3 w-full">
              <Notice kind="ok">{submitMsg}</Notice>
            </div>
          )}
        </div>

        <div className="space-y-6">
        <aside className="panel p-5 h-fit lg:sticky lg:top-24">
          <ArcadeBountyHeader game="hopper" />
          <div className="kicker mb-1.5">Weekly leaderboard</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Best replay-verified score per hunter, last 7 days.{" "}
            <Link href="/bounties" className="text-neon hover:underline">
              All bounties →
            </Link>
          </p>
          {board.length === 0 ? (
            <p className="text-fog text-sm">No scores yet — be the first frog in.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {board.map((row) => (
                  <tr key={row.rank} className="table-row">
                    <td className="py-1.5 pr-2 mono text-xs" style={{ color: "var(--text-dim)" }}>
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="py-1.5 pr-2 mono text-xs">{row.player}</td>
                    <td className="py-1.5 stat-number text-neon text-right">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-5 pt-4 border-t hidden sm:block" style={{ borderColor: "var(--hairline)" }}>
            <div className="kicker !text-[0.6rem] mb-2">Keys</div>
            <div className="text-xs space-y-1.5" style={{ color: "var(--text-dim)" }}>
              <div><span className="mono text-frost">←↑↓→ / WASD</span> hop</div>
              <div><span className="mono text-frost">Space</span> restart</div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
