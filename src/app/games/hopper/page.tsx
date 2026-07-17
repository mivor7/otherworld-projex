"use client";

// Hopper — free lane-crossing arcade game. Scores feed the weekly bounty
// leaderboard. Runs are tokenized server-side (see /api/arcade/start) so the
// board can pay real prizes without trivial spoofing.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { ARCADE, CAR_COLORS } from "@/lib/arcade-palette";

const COLS = 9;
const ROWS = 11;
const CELL = 44;
const W = COLS * CELL;
const H = ROWS * CELL;

type Car = { x: number; lane: number; speed: number; len: number; hue: string };

type GameState = {
  frog: { col: number; row: number };
  cars: Car[];
  score: number;
  lives: number;
  best: number;
  level: number;
  over: boolean;
  started: boolean;
  paused: boolean;
};

function makeCars(level: number): Car[] {
  const cars: Car[] = [];
  // Lanes 1..9 are roads (0 = goal, 10 = start).
  for (let lane = 1; lane < ROWS - 1; lane++) {
    if (lane === Math.floor(ROWS / 2)) continue; // median — safe row
    const dir = lane % 2 === 0 ? 1 : -1;
    const speed = dir * (0.6 + Math.random() * 0.9 + level * 0.18);
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      cars.push({
        x: (W / count) * i + Math.random() * 60,
        lane,
        speed,
        len: CELL * (1.4 + Math.random()),
        hue: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      });
    }
  }
  return cars;
}

export default function HopperPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    frog: { col: 4, row: ROWS - 1 },
    cars: makeCars(0),
    score: 0,
    lives: 3,
    best: 0,
    level: 0,
    over: true,
    started: false,
    paused: false,
  });
  const runTokenRef = useRef<string | null>(null);
  const [hud, setHud] = useState({ score: 0, lives: 3, over: true, started: false, paused: false });
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
    async (score: number) => {
      if (!runTokenRef.current || score <= 0) return;
      const res = await fetch("/api/arcade/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runToken: runTokenRef.current, score }),
      });
      runTokenRef.current = null;
      if (res.ok) {
        const data = await res.json();
        setSubmitMsg(
          data.ranked
            ? `Score ${score} posted to the bounty board.`
            : `Score ${score} saved — unranked. Burn ${CLIENT_CONFIG.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT (lifetime) to compete for prizes.`
        );
        loadBoard();
      }
    },
    [loadBoard]
  );

  const start = useCallback(async () => {
    setSubmitMsg(null);
    if (me.signedIn) {
      try {
        const res = await fetch("/api/arcade/start", { method: "POST" });
        const data = await res.json();
        runTokenRef.current = data.runToken ?? null;
      } catch {
        runTokenRef.current = null;
      }
    }
    const s = stateRef.current;
    s.frog = { col: 4, row: ROWS - 1 };
    s.cars = makeCars(0);
    s.score = 0;
    s.lives = 3;
    s.level = 0;
    s.over = false;
    s.started = true;
    s.paused = false;
  }, [me.signedIn]);

  const hop = useCallback(
    (dc: number, dr: number) => {
      const s = stateRef.current;
      if (s.over || s.paused) return;
      const col = Math.min(COLS - 1, Math.max(0, s.frog.col + dc));
      const row = Math.min(ROWS - 1, Math.max(0, s.frog.row + dr));
      if (dr < 0 && row < s.frog.row) s.score += 1;
      s.frog = { col, row };
      if (row === 0) {
        // Made it across — bonus, next level is faster.
        s.score += 10;
        s.level += 1;
        s.cars = makeCars(s.level);
        s.frog = { col: 4, row: ROWS - 1 };
      }
    },
    []
  );

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
        hop(...map[e.key]);
      }
      if (e.key === " " && stateRef.current.over) {
        e.preventDefault();
        start();
      }
      if (e.key === "p" && stateRef.current.started && !stateRef.current.over) {
        stateRef.current.paused = !stateRef.current.paused;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hop, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const tick = () => {
      const s = stateRef.current;
      if (!s.over && !s.paused) {
        // Move cars & wrap.
        for (const car of s.cars) {
          car.x += car.speed;
          if (car.speed > 0 && car.x > W + 20) car.x = -car.len - 20;
          if (car.speed < 0 && car.x < -car.len - 20) car.x = W + 20;
        }
        // Collision.
        const fx = s.frog.col * CELL + CELL / 2;
        for (const car of s.cars) {
          if (car.lane !== s.frog.row) continue;
          if (fx > car.x - 6 && fx < car.x + car.len + 6) {
            s.lives -= 1;
            s.frog = { col: 4, row: ROWS - 1 };
            if (s.lives <= 0) {
              s.over = true;
              s.best = Math.max(s.best, s.score);
              submitScore(s.score);
            }
            break;
          }
        }
      }

      // ——— draw ———
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < ROWS; r++) {
        const isSafe = r === 0 || r === ROWS - 1 || r === Math.floor(ROWS / 2);
        ctx.fillStyle = isSafe ? "oklch(0.78 0.11 150 / 0.07)" : "rgba(255,255,255,0.02)";
        ctx.fillRect(0, r * CELL, W, CELL - 1);
      }
      ctx.fillStyle = ARCADE.limeFaint;
      ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
      ctx.fillText("GOAL +10", 10, CELL - 17);

      for (const car of s.cars) {
        ctx.fillStyle = car.hue;
        ctx.beginPath();
        ctx.roundRect(car.x, car.lane * CELL + 8, car.len, CELL - 17, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.roundRect(car.x + 3, car.lane * CELL + 11, car.len - 6, 8, 4);
        ctx.fill();
      }

      // Frog.
      ctx.font = `${CELL - 12}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = ARCADE.lime;
      ctx.shadowBlur = 8;
      ctx.fillText("🐸", s.frog.col * CELL + CELL / 2, s.frog.row * CELL + CELL / 2 + 2);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      setHud((h) =>
        h.score !== s.score || h.lives !== s.lives || h.over !== s.over ||
        h.started !== s.started || h.paused !== s.paused
          ? { score: s.score, lives: s.lives, over: s.over, started: s.started, paused: s.paused }
          : h
      );
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
        kicker="Wing I — free arcade"
        title="Hopper"
        desc="Arrows / WASD to hop. +1 per forward hop, +10 per crossing, three lives. Signed-in runs post to the weekly bounty board."
      />
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="panel panel-glow p-4 flex flex-col items-center">
          <div className="flex gap-7 mb-3 items-baseline">
            <span className="kicker !text-[0.6rem]">
              Score <span className="stat-number text-neon text-sm ml-1.5">{hud.score}</span>
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
            {hud.paused && !hud.over && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-lg"
                style={{ background: "oklch(0.12 0.008 270 / 0.7)" }}
              >
                <span className="badge badge-live">Paused — press P</span>
              </div>
            )}
            {hud.over && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-abyss/80 rounded-lg">
                {hud.started && (
                  <div className="stat-number text-2xl neon-text mb-3">
                    Run over — {hud.score} pts
                  </div>
                )}
                <button className="btn btn-primary text-lg px-10 py-3" onClick={start}>
                  {hud.started ? "Hop again" : "Start hopping"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-6 text-center">
                    Playing as guest — sign in to compete for bounties.
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Mobile controls */}
          <div className="grid grid-cols-3 gap-2 mt-4 sm:hidden">
            <div />
            <button className="btn btn-ghost" onClick={() => hop(0, -1)}>↑</button>
            <div />
            <button className="btn btn-ghost" onClick={() => hop(-1, 0)}>←</button>
            <button className="btn btn-ghost" onClick={() => hop(0, 1)}>↓</button>
            <button className="btn btn-ghost" onClick={() => hop(1, 0)}>→</button>
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
              <div><span className="mono text-frost">P</span> pause · <span className="mono text-frost">Space</span> restart</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
