"use client";

// Worm Frog — EP 04. "Slither, grow, and don't bite your own tail."
// Classic snake on the tokenized arcade flow; scores feed the bounty board.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";

const GRID = 21;
const CELL = 22;
const W = GRID * CELL;
const H = GRID * CELL;
const BASE_MS = 140;

type Point = { x: number; y: number };
type Game = {
  snake: Point[];
  dir: Point;
  nextDir: Point;
  fly: Point;
  score: number;
  flies: number;
  over: boolean;
  started: boolean;
  stepMs: number;
  acc: number;
  last: number;
};

function spawnFly(snake: Point[]): Point {
  while (true) {
    const p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

export default function WormPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const [hud, setHud] = useState({ score: 0, flies: 0, over: true, started: false });
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
    async (score: number) => {
      if (!runTokenRef.current || score <= 0) return;
      const res = await fetch("/api/arcade/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runToken: runTokenRef.current, score }),
      });
      runTokenRef.current = null;
      if (res.ok) {
        setSubmitMsg(`Score ${score} posted to the bounty board.`);
        loadBoard();
      }
    },
    [loadBoard]
  );

  const start = useCallback(async () => {
    setSubmitMsg(null);
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
    const mid = Math.floor(GRID / 2);
    const snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    gameRef.current = {
      snake,
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      fly: spawnFly(snake),
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
        submitScore(g.score);
        return;
      }
      g.snake.unshift(head);
      if (head.x === g.fly.x && head.y === g.fly.y) {
        g.score += 10;
        g.flies += 1;
        g.fly = spawnFly(g.snake);
        if (g.flies % 5 === 0) g.stepMs = Math.max(70, g.stepMs - 9);
      } else {
        g.snake.pop();
      }
    };

    const tick = (now: number) => {
      const g = gameRef.current;
      if (g && !g.over) {
        g.acc += now - g.last;
        g.last = now;
        while (g.acc >= g.stepMs) {
          g.acc -= g.stepMs;
          step(g);
          if (g.over) break;
        }
      } else if (g) {
        g.last = now;
      }

      // draw
      ctx.fillStyle = "#080d0b";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
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
          ctx.shadowColor = "#36f581";
          ctx.shadowBlur = i === 0 ? 12 : 5;
          ctx.fillStyle = i === 0 ? "#a9f5b8" : `rgba(94, ${220 - t * 90}, 128, 1)`;
          ctx.beginPath();
          ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 7 : 5);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        // eyes on head
        const h = g.snake[0];
        ctx.fillStyle = "#0b100f";
        ctx.beginPath();
        ctx.arc(h.x * CELL + CELL / 2 - 4, h.y * CELL + CELL / 2 - 3, 2, 0, 7);
        ctx.arc(h.x * CELL + CELL / 2 + 4, h.y * CELL + CELL / 2 - 3, 2, 0, 7);
        ctx.fill();

        setHud((prev) =>
          prev.score !== g.score || prev.flies !== g.flies || prev.over !== g.over || prev.started !== g.started
            ? { score: g.score, flies: g.flies, over: g.over, started: g.started }
            : prev
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [submitScore]);

  return (
    <div className="pt-10">
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
          <div className="flex gap-6 mb-3 stat-number text-sm">
            <span>SCORE <span className="text-neon">{hud.score}</span></span>
            <span>FLIES <span className="text-gold">{hud.flies}</span></span>
          </div>
          <div className="relative w-full max-w-[462px]">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="w-full rounded-lg border"
              style={{ borderColor: "var(--hairline-strong)" }}
            />
            {hud.over && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-lg"
                style={{ background: "oklch(0.12 0.008 270 / 0.82)" }}
              >
                {hud.started && (
                  <div className="stat-number text-xl text-neon mb-3">
                    Tail bitten — {hud.score} pts
                  </div>
                )}
                <button className="btn btn-primary btn-lg px-9" onClick={start}>
                  {hud.started ? "Slither again" : "Start slithering"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-8 text-center">
                    Playing as guest — sign in to compete for bounties.
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
            Best score per hunter, last 7 days.{" "}
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
        </aside>
      </div>
    </div>
  );
}
