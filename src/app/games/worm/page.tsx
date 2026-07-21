"use client";

// Worm Frog — EP 04. "Slither, grow, and don't bite your own tail."
// Replay-verified snake: the run token seeds the PRNG, every keypress is
// recorded, and the server re-simulates the whole run (src/lib/worm-sim.ts)
// to compute the score itself. Fabricated scores can't rank.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { ArcadeBountyHeader } from "@/components/arcade-bounty-header";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { useHouseConfig } from "@/components/use-house-config";
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
  // Attract mode: a little self-driving worm behind the start overlay.
  // Local entropy only — never recorded, never submitted.
  const attractRef = useRef<Game | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const overAtRef = useRef(0);
  const pendingSubmitRef = useRef<Promise<void> | null>(null);
  const popRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const spritesRef = useRef<{ head?: HTMLImageElement; seg?: HTMLImageElement; fly?: HTMLImageElement }>({});
  const [hud, setHud] = useState({ score: 0, flies: 0, steps: 0, over: true, started: false });

  // Preload sprites; the draw loop uses them once ready, painted shapes until then.
  useEffect(() => {
    const load = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    spritesRef.current = {
      head: load("/art/owp_worm_head.png"),
      seg: load("/art/owp_worm_segment.png"),
      fly: load("/art/owp_worm_fly.png"),
    };
  }, []);
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const house = useHouseConfig();

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
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          setSubmitMsg(
            data.ranked
              ? `Score ${score} posted to the leaderboard — replay verified.`
              : `Score ${score} verified & saved — unranked. Prize boards need ${house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT spent on credits lifetime and ${house.rankedMinWindowBurnedRibbit.toLocaleString()}+ inside the board week.`
          );
          loadBoard();
          // Same signal the table games fire — refreshes the live bounty header.
          window.dispatchEvent(new Event("owp:round"));
        } else {
          // A rejected run must never fail silently — the player just watched
          // their score vanish otherwise.
          setSubmitMsg(`Score ${score} not submitted — ${data?.error ?? "connection lost"}.`);
        }
      })().catch(() =>
        setSubmitMsg(`Score ${score} not submitted — connection lost.`)
      );
    },
    [loadBoard, house]
  );

  const makeLocalGame = useCallback((): Game => {
    const rand = mulberry32((Math.random() * 2 ** 31) | 0);
    const snake = initialSnake();
    return {
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
  }, []);

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
    overAtRef.current = 0;
    if (me.signedIn) {
      try {
        const res = await fetch("/api/arcade/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: "worm" }),
        });
        const data = await res.json();
        runTokenRef.current = data.runToken ?? null;
        if (!runTokenRef.current) {
          // Paused arcade / any start failure: play on, but say the run
          // won't rank — never let a signed-in run go unranked silently.
          setSubmitMsg(`Playing unranked — ${data.error ?? "ranked runs unavailable right now"}.`);
        }
      } catch {
        runTokenRef.current = null;
        setSubmitMsg("Playing unranked — couldn't reach the house.");
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
        // A run just ended: swallow the Space that was steering the game so
        // it can't skip the recap and void the submission window.
        if (overAtRef.current && performance.now() - overAtRef.current < 700) return;
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
    // HiDPI: render at device resolution, draw in logical pixels.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // Greedy auto-pilot for the attract worm: chase the fly, never reverse,
    // avoid walls and its own body; on death, a fresh worm takes over.
    const drive = (a: Game) => {
      const head = a.snake[0];
      const blocked = (x: number, y: number) =>
        x < 0 || x >= GRID || y < 0 || y >= GRID ||
        a.snake.some((seg) => seg.x === x && seg.y === y);
      const cands: Point[] = [];
      if (a.fly.x > head.x) cands.push(DIRS[0]);
      if (a.fly.x < head.x) cands.push(DIRS[1]);
      if (a.fly.y < head.y) cands.push(DIRS[2]);
      if (a.fly.y > head.y) cands.push(DIRS[3]);
      cands.push(DIRS[0], DIRS[1], DIRS[2], DIRS[3]);
      for (const d of cands) {
        if (d.x === -a.dir.x && d.y === -a.dir.y) continue;
        if (!blocked(head.x + d.x, head.y + d.y)) {
          a.nextDir = d;
          return;
        }
      }
    };

    const tick = (now: number) => {
      let g = gameRef.current;
      if (!g || g.over) {
        // idle: run the attract worm instead
        if (!attractRef.current || attractRef.current.over) {
          attractRef.current = makeLocalGame();
        }
        const a = attractRef.current;
        a.acc += now - a.last;
        a.last = now;
        if (a.acc > 400) a.acc = 400;
        while (a.acc >= a.stepMs) {
          a.acc -= a.stepMs;
          drive(a);
          step(a);
          if (a.over) break;
        }
        if (!g) g = a;
      }
      if (g && !g.over && g === gameRef.current) {
        g.acc += now - g.last;
        g.last = now;
        if (g.acc > 400) g.acc = 400; // background-tab catch-up cap
        while (g.acc >= g.stepMs) {
          g.acc -= g.stepMs;
          step(g);
          if (g.over) break;
        }
        if (g.over && overAtRef.current === 0) overAtRef.current = performance.now();
      } else if (gameRef.current) {
        gameRef.current.last = now;
      }

      // draw — quiet checkerboard well
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "oklch(1 0 0 / 0.016)";
      for (let cy = 0; cy < GRID; cy++) {
        for (let cx = (cy % 2); cx < GRID; cx += 2) {
          ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
        }
      }

      if (g) {
        const nowMs = performance.now();
        // fly — grounded by a soft shadow, hovering gently
        const bob = Math.sin(nowMs / 260) * 1.6;
        const flyX = g.fly.x * CELL + CELL / 2;
        const flyY = g.fly.y * CELL + CELL / 2;
        ctx.fillStyle = "oklch(0 0 0 / 0.3)";
        ctx.beginPath();
        ctx.ellipse(flyX, flyY + 7, 6, 2.2, 0, 0, 7);
        ctx.fill();
        const flySprite = spritesRef.current.fly;
        if (flySprite?.complete && flySprite.naturalWidth) {
          const fd = CELL + 4;
          ctx.drawImage(flySprite, flyX - fd / 2, flyY - fd / 2 + bob, fd, fd);
        } else {
          ctx.font = `${CELL - 4}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🪰", flyX, flyY + 1 + bob);
        }

        const S = spritesRef.current;
        const spriteReady = !!(
          S.head?.complete && S.head.naturalWidth &&
          S.seg?.complete && S.seg.naturalWidth
        );

        if (spriteReady) {
          // sprite worm: glossy beads tail→neck, a rotated head sprite on top
          for (let i = g.snake.length - 1; i >= 1; i--) {
            const s = g.snake[i];
            const d = CELL + 2;
            ctx.drawImage(S.seg!, s.x * CELL + CELL / 2 - d / 2, s.y * CELL + CELL / 2 - d / 2, d, d);
          }
          const h = g.snake[0];
          const hx = h.x * CELL + CELL / 2;
          const hy = h.y * CELL + CELL / 2;
          const hd = CELL + 8;
          const angle = Math.atan2(g.dir.y, g.dir.x) + Math.PI / 2; // sprite faces up
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(angle);
          ctx.drawImage(S.head!, -hd / 2, -hd / 2, hd, hd);
          ctx.restore();
        } else {
          // painted fallback — one continuous lime body + a glowing head
          const pts = g.snake.map((seg) => ({
            x: seg.x * CELL + CELL / 2,
            y: seg.y * CELL + CELL / 2,
          }));
          if (pts.length > 1) {
            const head = pts[0];
            const tail = pts[pts.length - 1];
            const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
            grad.addColorStop(0, "oklch(0.42 0.06 150)");
            grad.addColorStop(0.65, "oklch(0.66 0.1 150)");
            grad.addColorStop(1, "oklch(0.8 0.11 150)");
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.strokeStyle = "oklch(0.1 0.012 165)";
            ctx.lineWidth = CELL - 4;
            ctx.stroke();
            ctx.strokeStyle = grad;
            ctx.lineWidth = CELL - 7;
            ctx.stroke();
            ctx.strokeStyle = "oklch(1 0 0 / 0.1)";
            ctx.lineWidth = Math.max(2, CELL - 16);
            ctx.stroke();
          }
          const h = g.snake[0];
          const hx = h.x * CELL + CELL / 2;
          const hy = h.y * CELL + CELL / 2;
          ctx.shadowColor = ARCADE.lime;
          ctx.shadowBlur = 12;
          ctx.fillStyle = ARCADE.limeSoft;
          ctx.beginPath();
          ctx.arc(hx, hy, CELL / 2 - 2.5, 0, 7);
          ctx.fill();
          ctx.shadowBlur = 0;
          const dx = g.dir.x, dy = g.dir.y;
          const px = -dy, py = dx;
          for (const side of [-1, 1]) {
            const ex = hx + px * 4.5 * side + dx * 2.5;
            const ey = hy + py * 4.5 * side + dy * 2.5;
            ctx.fillStyle = "oklch(0.97 0.003 270)";
            ctx.beginPath();
            ctx.arc(ex, ey, 3, 0, 7);
            ctx.fill();
            ctx.fillStyle = ARCADE.ink;
            ctx.beginPath();
            ctx.arc(ex + dx * 1.2, ey + dy * 1.2, 1.6, 0, 7);
            ctx.fill();
          }
        }

        // eat ripple — an expanding ring where the fly vanished
        if (popRef.current) {
          const age = (nowMs - popRef.current.at) / 450;
          if (age < 1) {
            ctx.strokeStyle = `oklch(0.78 0.11 150 / ${(0.5 * (1 - age)).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
              popRef.current.x * CELL + CELL / 2,
              popRef.current.y * CELL + CELL / 2,
              4 + age * 18,
              0,
              7
            );
            ctx.stroke();
          }
        }

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

        const real = gameRef.current;
        if (real) {
          setHud((prev) =>
            prev.score !== real.score || prev.flies !== real.flies || prev.over !== real.over ||
            prev.started !== real.started || prev.steps !== real.steps
              ? { score: real.score, flies: real.flies, steps: real.steps, over: real.over, started: real.started }
              : prev
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [submitScore, makeLocalGame]);

  return (
    <div className="pt-6 max-w-4xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        compact
        kicker="Wing I — free arcade · EP 04"
        title="Worm Frog"
        desc="Slither, grow, and don't bite your own tail. Arrows / WASD to steer — every fly is worth 10, the pace keeps climbing."
      />
      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="panel panel-glow game-stage p-5 flex flex-col items-center">          <div className="flex gap-7 mb-3 items-baseline">
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
              className="rounded-lg border block mx-auto"
              style={{ borderColor: "var(--hairline-strong)", width: "100%", maxWidth: W, height: "auto" }}
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
                    Practice run — sign in and spend $RIBBIT on credits to compete for prizes.
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

        <div className="space-y-6">
        <aside className="panel p-5 h-fit lg:sticky lg:top-24">
          <ArcadeBountyHeader game="worm" />
          <div className="kicker mb-1.5">Weekly leaderboard</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Best replay-verified score per hunter, last 7 days.{" "}
            <Link href="/bounties" className="text-neon hover:underline">
              All bounties →
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
    </div>
  );
}
