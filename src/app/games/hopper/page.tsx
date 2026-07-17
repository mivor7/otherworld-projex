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
import { CLIENT_CONFIG } from "@/lib/client-config";
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
  const queueRef = useRef<number[]>([]);
  const traceRef = useRef<HInput[]>([]);
  const runTokenRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<Promise<void> | null>(null);
  const submittedRef = useRef(false);
  const [hud, setHud] = useState({
    score: 0, lives: 3, level: 0, over: true, started: false, seconds: 0,
  });
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

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
        if (res.ok) {
          const data = await res.json();
          setSubmitMsg(
            data.ranked
              ? `Score ${score} posted to the bounty board — replay verified.`
              : `Score ${score} verified & saved — unranked. Prize boards need ${CLIENT_CONFIG.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT burned lifetime and ${CLIENT_CONFIG.rankedMinWindowBurnedRibbit.toLocaleString()}+ inside the board week.`
          );
          loadBoard();
        }
      })().catch(() => {});
    },
    [loadBoard]
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
      } catch {
        runTokenRef.current = null;
      }
    }
    const seed = runTokenRef.current
      ? seedFromToken(runTokenRef.current)
      : (Math.random() * 2 ** 31) | 0;
    gameRef.current = createHopper(seed);
    queueRef.current = [];
    traceRef.current = [];
    submittedRef.current = false;
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
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      const g = gameRef.current;

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
          submitScore(g.score, traceRef.current);
        }
      }
      last = now;

      // ——— render ———
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < HROWS; r++) {
        const isSafe = r === 0 || r === HROWS - 1 || r === Math.floor(HROWS / 2);
        ctx.fillStyle = isSafe ? "oklch(0.78 0.11 150 / 0.07)" : "rgba(255,255,255,0.02)";
        ctx.fillRect(0, r * HCELL, W, HCELL - 1);
        if (!isSafe) {
          // Lane dashes.
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.setLineDash([10, 14]);
          ctx.beginPath();
          ctx.moveTo(0, r * HCELL + HCELL / 2);
          ctx.lineTo(W, r * HCELL + HCELL / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
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
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(car.x, car.lane * HCELL + 8, car.len, HCELL - 17, 6);
          ctx.fill();
          // Cabin highlight + a light "front" hinting the direction.
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.beginPath();
          ctx.roundRect(car.x + 3, car.lane * HCELL + 11, car.len - 6, 8, 4);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          const frontX = car.speed > 0 ? car.x + car.len - 5 : car.x + 2;
          ctx.fillRect(frontX, car.lane * HCELL + 12, 3, HCELL - 25);
        });

        // Frog — small hop bounce right after a move.
        const sinceHop = g.frame - g.lastHopFrame;
        const bounce = sinceHop < 6 ? Math.sin((sinceHop / 6) * Math.PI) * 4 : 0;
        ctx.font = `${HCELL - 12}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = ARCADE.lime;
        ctx.shadowBlur = 8;
        ctx.fillText(
          "🐸",
          g.frog.col * HCELL + HCELL / 2,
          g.frog.row * HCELL + HCELL / 2 + 2 - bounce
        );
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        // Brief danger flash on a lost life.
        if (g.frame - g.lastDeathFrame < 12 && !g.over) {
          const t = 1 - (g.frame - g.lastDeathFrame) / 12;
          ctx.fillStyle = `oklch(0.64 0.18 25 / ${(t * 0.22).toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }

        setHud((h) => {
          const seconds = Math.floor((g.frame * HFRAME_MS) / 1000);
          return h.score !== g.score || h.lives !== g.lives || h.over !== g.over ||
            h.level !== g.level || h.seconds !== seconds || !h.started
            ? { score: g.score, lives: g.lives, level: g.level, over: g.over, started: true, seconds }
            : h;
        });
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
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="panel panel-glow p-4 flex flex-col items-center">
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
                    Practice run — sign in and burn $RIBBIT to compete for prizes.
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

        <aside className="panel p-5 h-fit">
          <div className="kicker mb-1.5">Weekly bounty board</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Best replay-verified score per hunter, last 7 days.{" "}
            <Link href="/bounties" className="text-neon hover:underline">
              Prizes →
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
  );
}
