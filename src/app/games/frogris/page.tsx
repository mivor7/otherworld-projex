"use client";

// Frogris — the Tetris episode, remastered. Free arcade play; signed-in runs
// post to the weekly bounty board through the same tokenized-run flow as
// Hopper (see /api/arcade/start).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";

const COLS = 10;
const ROWS = 20;
const CELL = 26;
const W = COLS * CELL;
const H = ROWS * CELL;

// [rotation][block] = [x, y] offsets from the piece origin.
const PIECES: { cells: number[][][]; color: string }[] = [
  { color: "#7ef29a", cells: [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]] ] }, // I
  { color: "#b9f27e", cells: [ [[1,0],[2,0],[1,1],[2,1]] ] }, // O
  { color: "#a586ff", cells: [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ] }, // T
  { color: "#5fd9a5", cells: [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]] ] }, // S
  { color: "#ffce4f", cells: [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]] ] }, // Z
  { color: "#4fc3ff", cells: [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ] }, // J
  { color: "#ff8d5f", cells: [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ] }, // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

type Game = {
  board: (string | null)[][]; // [row][col] = color
  bag: number[];
  piece: number;
  rot: number;
  x: number;
  y: number;
  next: number;
  score: number;
  lines: number;
  over: boolean;
  started: boolean;
  dropMs: number;
  acc: number;
  last: number;
};

function refillBag(): number[] {
  const bag = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function cellsOf(piece: number, rot: number): number[][] {
  const states = PIECES[piece].cells;
  return states[rot % states.length];
}

function collides(g: Game, piece: number, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of cellsOf(piece, rot)) {
    const bx = x + cx;
    const by = y + cy;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && g.board[by][bx]) return true;
  }
  return false;
}

export default function FrogrisPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 0, over: true, started: false });
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const loadBoard = useCallback(() => {
    fetch("/api/leaderboard?game=frogris")
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

  const spawn = useCallback((g: Game) => {
    g.piece = g.next;
    if (g.bag.length === 0) g.bag = refillBag();
    g.next = g.bag.pop()!;
    g.rot = 0;
    g.x = 3;
    g.y = -1;
    if (collides(g, g.piece, g.rot, g.x, g.y + 1)) {
      g.over = true;
      submitScore(g.score);
    }
  }, [submitScore]);

  const lock = useCallback(
    (g: Game) => {
      for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
        const by = g.y + cy;
        if (by >= 0) g.board[by][g.x + cx] = PIECES[g.piece].color;
      }
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (g.board[r].every(Boolean)) {
          g.board.splice(r, 1);
          g.board.unshift(Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }
      if (cleared > 0) {
        const level = Math.floor(g.lines / 10);
        g.score += LINE_SCORES[cleared] * (level + 1);
        g.lines += cleared;
        g.dropMs = Math.max(110, 760 - Math.floor(g.lines / 10) * 60);
      }
      spawn(g);
    },
    [spawn]
  );

  const start = useCallback(async () => {
    setSubmitMsg(null);
    if (me.signedIn) {
      try {
        const res = await fetch("/api/arcade/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: "frogris" }),
        });
        const data = await res.json();
        runTokenRef.current = data.runToken ?? null;
      } catch {
        runTokenRef.current = null;
      }
    }
    const bag = refillBag();
    const g: Game = {
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      bag,
      piece: 0,
      rot: 0,
      x: 3,
      y: -1,
      next: bag.pop()!,
      score: 0,
      lines: 0,
      over: false,
      started: true,
      dropMs: 760,
      acc: 0,
      last: performance.now(),
    };
    gameRef.current = g;
    spawn(g);
  }, [me.signedIn, spawn]);

  const move = useCallback((dx: number) => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (!collides(g, g.piece, g.rot, g.x + dx, g.y)) g.x += dx;
  }, []);

  const rotate = useCallback((dir: 1 | -1) => {
    const g = gameRef.current;
    if (!g || g.over) return;
    const states = PIECES[g.piece].cells.length;
    const rot = (g.rot + dir + states) % states;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(g, g.piece, rot, g.x + kick, g.y)) {
        g.rot = rot;
        g.x += kick;
        return;
      }
    }
  }, []);

  const softDrop = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (!collides(g, g.piece, g.rot, g.x, g.y + 1)) g.y += 1;
    else lock(g);
  }, [lock]);

  const hardDrop = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.over) return;
    while (!collides(g, g.piece, g.rot, g.x, g.y + 1)) g.y += 1;
    lock(g);
  }, [lock]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (e.key === " " && (!g || g.over)) {
        e.preventDefault();
        start();
        return;
      }
      if (!g || g.over) return;
      switch (e.key) {
        case "ArrowLeft": case "a": e.preventDefault(); move(-1); break;
        case "ArrowRight": case "d": e.preventDefault(); move(1); break;
        case "ArrowDown": case "s": e.preventDefault(); softDrop(); break;
        case "ArrowUp": case "x": e.preventDefault(); rotate(1); break;
        case "z": e.preventDefault(); rotate(-1); break;
        case " ": e.preventDefault(); hardDrop(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, rotate, softDrop, hardDrop, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const nextCanvas = nextRef.current;
    if (!canvas || !nextCanvas) return;
    const ctx = canvas.getContext("2d")!;
    const nctx = nextCanvas.getContext("2d")!;
    let raf = 0;

    const drawCell = (c: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL) => {
      c.shadowColor = color;
      c.shadowBlur = 6;
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, 4);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.beginPath();
      c.roundRect(x + 3, y + 3, size - 6, (size - 6) / 2.6, 3);
      c.fill();
    };

    const tick = (now: number) => {
      const g = gameRef.current;
      if (g && !g.over) {
        g.acc += now - g.last;
        g.last = now;
        while (g.acc >= g.dropMs) {
          g.acc -= g.dropMs;
          if (!collides(g, g.piece, g.rot, g.x, g.y + 1)) g.y += 1;
          else lock(g);
        }
      } else if (g) {
        g.last = now;
      }

      ctx.fillStyle = "#080d0b";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
      }
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
      }

      if (g) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const color = g.board[r][c];
            if (color) drawCell(ctx, c * CELL, r * CELL, color);
          }
        }
        if (!g.over) {
          // Ghost piece.
          let gy = g.y;
          while (!collides(g, g.piece, g.rot, g.x, gy + 1)) gy += 1;
          ctx.globalAlpha = 0.18;
          for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
            if (gy + cy >= 0) drawCell(ctx, (g.x + cx) * CELL, (gy + cy) * CELL, PIECES[g.piece].color);
          }
          ctx.globalAlpha = 1;
          for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
            if (g.y + cy >= 0) drawCell(ctx, (g.x + cx) * CELL, (g.y + cy) * CELL, PIECES[g.piece].color);
          }
        }

        // Next preview.
        nctx.fillStyle = "#080d0b";
        nctx.fillRect(0, 0, 104, 104);
        for (const [cx, cy] of cellsOf(g.next, 0)) {
          drawCell(nctx, cx * 24 + 4, cy * 24 + 16, PIECES[g.next].color, 24);
        }

        setHud((h) => {
          const level = Math.floor(g.lines / 10);
          return h.score !== g.score || h.lines !== g.lines || h.level !== level ||
            h.over !== g.over || h.started !== g.started
            ? { score: g.score, lines: g.lines, level, over: g.over, started: g.started }
            : h;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lock]);

  return (
    <div className="pt-10">
      <SectionTitle
        kicker="Wing I — free arcade"
        title="Frogris"
        desc="The falling-block episode. Arrows to move, ↑ to rotate, space to drop. Clear lines, chase levels — signed-in runs post to the weekly bounty board."
      />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="panel panel-glow p-5 flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="rounded-lg border"
              style={{ borderColor: "var(--hairline-strong)" }}
            />
            {hud.over && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-lg"
                style={{ background: "oklch(0.12 0.008 270 / 0.82)" }}
              >
                {hud.started && (
                  <div className="stat-number text-xl text-neon mb-3">
                    Stack topped — {hud.score} pts
                  </div>
                )}
                <button className="btn btn-primary btn-lg px-9" onClick={start}>
                  {hud.started ? "Play again" : "Start"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-8 text-center">
                    Playing as guest — sign in to compete for bounties.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex sm:flex-col gap-5 items-center sm:items-start">
            <div>
              <div className="kicker mb-1.5">Next</div>
              <canvas
                ref={nextRef}
                width={104}
                height={104}
                className="rounded-md border"
                style={{ borderColor: "var(--hairline)" }}
              />
            </div>
            <div className="space-y-3">
              {[
                ["Score", hud.score],
                ["Lines", hud.lines],
                ["Level", hud.level],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="kicker !text-[0.6rem]">{label}</div>
                  <div className="stat-number text-neon text-lg">{value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Mobile controls */}
          <div className="grid grid-cols-4 gap-2 sm:hidden w-full">
            <button className="btn btn-ghost" onClick={() => move(-1)}>←</button>
            <button className="btn btn-ghost" onClick={() => rotate(1)}>⟳</button>
            <button className="btn btn-ghost" onClick={() => move(1)}>→</button>
            <button className="btn btn-ghost" onClick={hardDrop}>⤓</button>
          </div>
          {submitMsg && (
            <div className="w-full sm:hidden">
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
            <p className="text-fog text-sm">No scores yet — set the first line.</p>
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
          {submitMsg && (
            <div className="mt-3 hidden sm:block">
              <Notice kind="ok">{submitMsg}</Notice>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
