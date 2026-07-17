"use client";

// Worm Frog — EP 04. "Slither, grow, and don't bite your own tail."
// Replay-verified snake: the run token seeds the PRNG, every keypress is
// recorded, and the server re-simulates the whole run (src/lib/worm-sim.ts)
// to compute the score itself. Fabricated scores can't rank.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { ARCADE } from "@/lib/arcade-palette";
import {
  DIRS,
  GRID,
  type Point,
  type Turn,
  initialSnake,
  mulberry32,
  seedFromToken,
  spawnFly,
} from "@/lib/worm-sim";

const CELL = 22;
const W = GRID * CELL;
const H = GRID * CELL;
const BASE_MS = 140;

type Game = {
  snake: Point[];
  dir: Point;
  nextDir: Point;
  fly: Point;
  rand: () => number;
  steps: number;
  trace: Turn[];
  score: number;
  flies: number;
  over: boolean;
  started: boolean;
  stepMs: number;
  acc: number;
  last: number;
};

export default function WormPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<Promise<void> | null>(null);
  const popRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const [hud, setHud] = useState({ score: 0, flies: 0, steps: 0, over: true, started: false });
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const loadBoard = useCallback(() => {
    fetch("/api/leaderboard?game=worm")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setBoard(rows))
      .catch(() => {});
  }, []);
  useEffect(loadBoard, [loadBoard]);

  const submitScore = useCallback(
    (score: number, trace: Turn[]) => {
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
    // Never race a restart past the previous run's submission — the server
    // voids the old run the moment a new one starts.
    if (pendingSubmitRef.current) {
      await pendingSubmitRef.current.catch(() => {});
      pendingSubmitRef.current = null;
    }
    runTokenRef.current = null;
    popRef.current = null;
    if (me.signedIn) {
      try {
        const res = await fetch("/api/arcade/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: "worm" }),
        });
        const data = await res.json();
        runTokenRef.current = data.runToken ?? null;
      } catch {
        runTokenRef.current = null;
      }
    }
    // Ranked runs derive the fly-spawn PRNG from the run token so the server
    // can replay them; guest runs get throwaway local entropy.
    const seed = runTokenRef.current
      ? seedFromToken(runTokenRef.current)
      : (Math.random() * 2 ** 31) | 0;
    const rand = mulberry32(seed);
    const snake = initialSnake();
    gameRef.current = {
      snake,
      dir: DIRS[0],
      nextDir: DIRS[0],
      fly: spawnFly(rand, snake),
      rand,
      steps: 0,
      trace: [],
      score: 0,
      flies: 0,
      over: false,
      started: true,
      stepMs: BASE_MS,
      acc: 0,
      last: performance.now(),
    };
  }, [me.signedIn]);

  const turn = useCallback((dx: number, dy: number) => {
    const g = gameRef.current;
    if (!g || g.over) return;
    // Record the raw press for the server replay — acceptance below runs
    // identically on both sides (see worm-sim.replay).
    const d = DIRS.findIndex((v) => v.x === dx && v.y === dy);
    if (d >= 0 && g.trace.length < 20_000) g.trace.push({ s: g.steps, d });
    // No 180° reversals.
    if (dx === -g.dir.x && dy === -g.dir.y) return;
    g.nextDir = { x: dx, y: dy };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1], w: [0, -1],
        ArrowDown: [0, 1], s: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0],
      };
      if (map[e.key]) {
        e.preventDefault();
        turn(...map[e.key]);
      }
      if (e.key === " " && (!gameRef.current || gameRef.current.over)) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const step = (g: Game) => {
      g.dir = g.nextDir;
      const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
      if (
        head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID ||
        g.snake.some((s) => s.x === head.x && s.y === head.y)
      ) {
        g.over = true;
        submitScore(g.score, g.trace);
        return;
      }
      g.snake.unshift(head);
      if (head.x === g.fly.x && head.y === g.fly.y) {
        g.score += 10;
        g.flies += 1;
        popRef.current = { x: head.x, y: head.y, at: performance.now() };
        g.fly = spawnFly(g.rand, g.snake);
        if (g.flies % 5 === 0) g.stepMs = Math.max(70, g.stepMs - 9);
      } else {
        g.snake.pop();
      }
      g.steps += 1;
    };

    const tick = (now: number) => {
      const g = gameRef.current;
      if (g && !g.over) {
        g.acc += now - g.last;
        g.last = now;
        if (g.acc > 400) g.acc = 400; // background-tab catch-up cap
        while (g.acc >= g.stepMs) {
          g.acc -= g.stepMs;
          step(g);
          if (g.over) break;
        }
      } else if (g) {
        g.last = now;
      }

      // draw
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = ARCADE.grid;
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke();
      }

      if (g) {
        // fly
        ctx.font = `${CELL - 4}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🪰", g.fly.x * CELL + CELL / 2, g.fly.y * CELL + CELL / 2 + 1);
        // worm
        g.snake.forEach((s, i) => {
          const t = i / Math.max(1, g.snake.length - 1);
          if (i === 0) {
            ctx.shadowColor = ARCADE.lime;
            ctx.shadowBlur = 10;
          }
          const fill =
            i === 0 ? ARCADE.limeSoft : `oklch(${(0.74 - t * 0.24).toFixed(3)} 0.1 150)`;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 7 : 5);
          ctx.fill();
          ctx.shadowBlur = 0;
          // Bridge to the previous segment so the worm reads as one body.
          if (i > 0) {
            const prev = g.snake[i - 1];
            const bx = (Math.min(s.x, prev.x) + 0.5) * CELL;
            const by = (Math.min(s.y, prev.y) + 0.5) * CELL;
            ctx.fillStyle = fill;
            if (s.x !== prev.x) ctx.fillRect(bx, s.y * CELL + 4, CELL, CELL - 8);
            else ctx.fillRect(s.x * CELL + 4, by, CELL - 8, CELL);
          }
        });
        // eyes on head
        const h = g.snake[0];
        ctx.fillStyle = ARCADE.ink;
        ctx.beginPath();
        ctx.arc(h.x * CELL + CELL / 2 - 4, h.y * CELL + CELL / 2 - 3, 2, 0, 7);
        ctx.arc(h.x * CELL + CELL / 2 + 4, h.y * CELL + CELL / 2 - 3, 2, 0, 7);
        ctx.fill();

        // "+10" pop where the fly was eaten.
        if (popRef.current) {
          const age = (performance.now() - popRef.current.at) / 650;
          if (age < 1) {
            ctx.globalAlpha = 1 - age;
            ctx.fillStyle = ARCADE.limeSoft;
            ctx.font = "600 15px 'Space Grotesk', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              "+10",
              popRef.current.x * CELL + CELL / 2,
              popRef.current.y * CELL - 2 - age * 16
            );
            ctx.globalAlpha = 1;
            ctx.textAlign = "left";
          } else {
            popRef.current = null;
          }
        }

        setHud((prev) =>
          prev.score !== g.score || prev.flies !== g.flies || prev.over !== g.over ||
          prev.started !== g.started || prev.steps !== g.steps
            ? { score: g.score, flies: g.flies, steps: g.steps, over: g.over, started: g.started }
            : prev
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [submitScore]);

  return (
    <div className="pt-10 max-w-4xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        kicker="Wing I — free arcade · EP 04"
        title="Worm Frog"
        desc="Slither, grow, and don't bite your own tail. Arrows / WASD to steer — every fly is worth 10, the pace keeps climbing."
      />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="panel panel-glow p-5 flex flex-col items-center">
          <div className="flex gap-7 mb-3 items-baseline">
            <span className="kicker !text-[0.6rem]">
              Score <span className="stat-number text-neon text-sm ml-1.5">{hud.score}</span>
            </span>
            <span className="kicker !text-[0.6rem]">
              Flies <span className="stat-number text-gold text-sm ml-1.5">{hud.flies}</span>
            </span>
          </div>
          <div className="relative w-full max-w-[462px]">
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
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-lg"
                style={{ background: "oklch(0.12 0.008 270 / 0.85)" }}
              >
                {hud.started && (
                  <div className="text-center mb-4">
                    <div className="stat-number text-2xl text-neon mb-2">
                      {hud.score} pts
                    </div>
                    <div className="text-xs space-x-3" style={{ color: "var(--text-dim)" }}>
                      <span>{hud.flies} flies</span>
                      <span>{hud.steps} steps</span>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary btn-lg px-9" onClick={start}>
                  {hud.started ? "Slither again" : "Start slithering"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-8 text-center">
                    Practice run — sign in and burn $RIBBIT to compete for prizes.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 sm:hidden w-full max-w-[280px]">
            <div />
            <button className="btn btn-ghost" onClick={() => turn(0, -1)}>↑</button>
            <div />
            <button className="btn btn-ghost" onClick={() => turn(-1, 0)}>←</button>
            <button className="btn btn-ghost" onClick={() => turn(0, 1)}>↓</button>
            <button className="btn btn-ghost" onClick={() => turn(1, 0)}>→</button>
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
            <p className="text-fog text-sm">No scores yet — the serpent waits.</p>
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
              <div><span className="mono text-frost">←↑↓→ / WASD</span> steer</div>
              <div><span className="mono text-frost">Space</span> restart</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
