"use client";

// Frogris — the Tetris episode. The page drives the SAME deterministic
// 60 Hz simulation the server verifies (src/lib/frogris-sim.ts): the run
// token seeds the piece bag, every input is queued and applied at a frame
// boundary, and the input trace is submitted with the score so the server
// can replay the whole run. Rendering is a pure view over the sim state.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { ArcadeBountyHeader } from "@/components/arcade-bounty-header";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { AmbientPond } from "@/components/ambient-pond";
import { useHouseConfig } from "@/components/use-house-config";
import { ARCADE, PIECE_COLORS } from "@/lib/arcade-palette";
import {
  FCOLS,
  FROWS,
  FRAME_MS,
  MAX_INPUTS_PER_FRAME,
  type FInput,
  type FrogrisState,
  cellsOf,
  collides,
  createFrogris,
  applyInput,
  frameTick,
} from "@/lib/frogris-sim";
import { seedFromToken } from "@/lib/worm-sim";

const CELL = 26;
const W = FCOLS * CELL;
const H = FROWS * CELL;

type Pop = { text: string; frame: number };

export default function FrogrisPage() {
  const { me } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FrogrisState | null>(null);
  const queueRef = useRef<number[]>([]);
  const traceRef = useRef<FInput[]>([]);
  const runTokenRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<Promise<void> | null>(null);
  const submittedRef = useRef(false);
  const overAtRef = useRef(0);
  const popRef = useRef<Pop | null>(null);
  const prevScoreRef = useRef(0);
  const tintedRef = useRef<HTMLCanvasElement[]>([]);

  // Preload the block tile and pre-tint one glossy copy per piece colour, so
  // every block is a real tile (falls back to the painted block until ready).
  useEffect(() => {
    const tile = new Image();
    tile.src = "/art/owp_frogris_tile.png";
    tile.onload = () => {
      tintedRef.current = PIECE_COLORS.map((color) => {
        const oc = document.createElement("canvas");
        oc.width = tile.naturalWidth;
        oc.height = tile.naturalHeight;
        const octx = oc.getContext("2d")!;
        octx.drawImage(tile, 0, 0);
        octx.globalCompositeOperation = "multiply"; // colourise, keep the gloss
        octx.fillStyle = color;
        octx.fillRect(0, 0, oc.width, oc.height);
        octx.globalCompositeOperation = "destination-in"; // clip back to tile alpha
        octx.drawImage(tile, 0, 0);
        return oc;
      });
    };
  }, []);
  const [hud, setHud] = useState({
    score: 0, lines: 0, level: 0, over: true, started: false, seconds: 0,
  });
  const [board, setBoard] = useState<{ rank: number; player: string; score: number }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const house = useHouseConfig();

  const loadBoard = useCallback(() => {
    fetch("/api/leaderboard?game=frogris")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setBoard(rows))
      .catch(() => {});
  }, []);
  useEffect(loadBoard, [loadBoard]);

  const submitScore = useCallback(
    (score: number, trace: FInput[]) => {
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
    // Never race a restart past the previous run's submission — the server
    // voids the old run the moment a new one starts.
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
          body: JSON.stringify({ game: "frogris" }),
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
    gameRef.current = createFrogris(seed);
    queueRef.current = [];
    traceRef.current = [];
    submittedRef.current = false;
    overAtRef.current = 0;
    popRef.current = null;
    prevScoreRef.current = 0;
  }, [me.signedIn]);

  // Inputs are queued and consumed at frame boundaries so the live game and
  // the server replay apply them at exactly the same sim time.
  const enqueue = useCallback((a: number) => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (queueRef.current.length < 8) queueRef.current.push(a);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (e.key === " " && (!g || g.over)) {
        e.preventDefault();
        // Space was the hard-drop key a moment ago — don't let the press
        // that ended the run instantly restart it.
        if (overAtRef.current && performance.now() - overAtRef.current < 700) return;
        start();
        return;
      }
      if (!g || g.over) return;
      switch (e.key) {
        case "ArrowLeft": case "a": e.preventDefault(); enqueue(0); break;
        case "ArrowRight": case "d": e.preventDefault(); enqueue(1); break;
        case "ArrowUp": case "x": e.preventDefault(); enqueue(2); break;
        case "z": e.preventDefault(); enqueue(3); break;
        case "ArrowDown": case "s": e.preventDefault(); enqueue(4); break;
        case " ": e.preventDefault(); enqueue(5); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enqueue, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const nextCanvas = nextRef.current;
    if (!canvas || !nextCanvas) return;
    const ctx = canvas.getContext("2d")!;
    const nctx = nextCanvas.getContext("2d")!;
    // HiDPI: render at device resolution, draw in logical pixels.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nextCanvas.width = 104 * dpr;
    nextCanvas.height = 104 * dpr;
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const drawCell = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      piece: number,
      size = CELL,
      alpha = 1
    ) => {
      c.globalAlpha = alpha;
      const tinted = tintedRef.current[piece];
      if (tinted) {
        c.drawImage(tinted, x + 1, y + 1, size - 2, size - 2);
        c.globalAlpha = 1;
        return;
      }
      // body (painted fallback)
      c.fillStyle = PIECE_COLORS[piece];
      c.beginPath();
      c.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, 5);
      c.fill();
      // bottom shade for depth
      const shade = c.createLinearGradient(0, y + size * 0.45, 0, y + size);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.28)");
      c.fillStyle = shade;
      c.beginPath();
      c.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, 5);
      c.fill();
      // gloss cap
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.beginPath();
      c.roundRect(x + 3, y + 3, size - 6, (size - 6) / 2.7, 3.5);
      c.fill();
      // keyline
      c.strokeStyle = "rgba(0,0,0,0.32)";
      c.lineWidth = 1;
      c.beginPath();
      c.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, 5);
      c.stroke();
      c.globalAlpha = 1;
    };

    // Ghost cells are outlined, not filled — quieter and more legible.
    const drawGhost = (x: number, y: number, piece: number) => {
      ctx.strokeStyle = PIECE_COLORS[piece];
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5, 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const g = gameRef.current;

      // Fixed-step sim: consume real time in 60 Hz frames.
      if (g && !g.over) {
        acc += now - last;
        // Don't spiral after a background tab: cap the catch-up.
        if (acc > 250) acc = 250;
        while (acc >= FRAME_MS && !g.over) {
          acc -= FRAME_MS;
          let applied = 0;
          while (queueRef.current.length > 0 && applied < MAX_INPUTS_PER_FRAME && !g.over) {
            const a = queueRef.current.shift()!;
            traceRef.current.push({ f: g.frame, a });
            applyInput(g, a);
            applied++;
          }
          if (!g.over) frameTick(g);
        }
        if (g.score > prevScoreRef.current) {
          popRef.current = { text: `+${g.score - prevScoreRef.current}`, frame: g.frame };
          prevScoreRef.current = g.score;
        }
        if (g.over && !submittedRef.current) {
          submittedRef.current = true;
          overAtRef.current = performance.now();
          submitScore(g.score, traceRef.current);
        }
      }
      last = now;

      // ——— render (pure view of sim state) ———
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = ARCADE.grid;
      for (let r = 1; r < FROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
      }
      for (let c = 1; c < FCOLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
      }
      // side walls of the well
      for (const [gx0, gx1] of [[0, 14], [W, W - 14]] as const) {
        const wall = ctx.createLinearGradient(gx0, 0, gx1, 0);
        wall.addColorStop(0, "rgba(0,0,0,0.26)");
        wall.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = wall;
        ctx.fillRect(Math.min(gx0, gx1), 0, 14, H);
      }

      if (g) {
        for (let r = 0; r < FROWS; r++) {
          for (let c = 0; c < FCOLS; c++) {
            const piece = g.board[r][c];
            if (piece !== null) drawCell(ctx, c * CELL, r * CELL, piece);
          }
        }
        if (!g.over) {
          // Ghost piece.
          let gy = g.y;
          while (!collides(g.board, g.piece, g.rot, g.x, gy + 1)) gy += 1;
          for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
            if (gy + cy >= 0) drawGhost((g.x + cx) * CELL, (gy + cy) * CELL, g.piece);
          }
          for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
            if (g.y + cy >= 0) drawCell(ctx, (g.x + cx) * CELL, (g.y + cy) * CELL, g.piece);
          }
        }

        // Line-clear flash — white core with a lime bloom, fading out.
        if (g.lastClear && g.frame - g.lastClear.frame < 18) {
          const t = 1 - (g.frame - g.lastClear.frame) / 18;
          for (const r of g.lastClear.rows) {
            const bloom = ctx.createLinearGradient(0, (r - 0.6) * CELL, 0, (r + 1.6) * CELL);
            bloom.addColorStop(0, "rgba(0,0,0,0)");
            bloom.addColorStop(0.5, `oklch(0.85 0.09 150 / ${(t * 0.4).toFixed(3)})`);
            bloom.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = bloom;
            ctx.fillRect(0, (r - 0.6) * CELL, W, CELL * 2.2);
            ctx.fillStyle = `oklch(0.98 0.005 150 / ${(t * t * 0.5).toFixed(3)})`;
            ctx.fillRect(0, r * CELL + 2, W, CELL - 4);
          }
        }

        // Score pop.
        if (popRef.current && g.frame - popRef.current.frame < 40) {
          const t = (g.frame - popRef.current.frame) / 40;
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = ARCADE.limeSoft;
          ctx.font = "600 20px 'Space Grotesk', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(popRef.current.text, W / 2, H * 0.3 - t * 26);
          ctx.globalAlpha = 1;
          ctx.textAlign = "left";
        }

        // Next preview.
        nctx.fillStyle = ARCADE.bg;
        nctx.fillRect(0, 0, 104, 104);
        for (const [cx, cy] of cellsOf(g.next, 0)) {
          drawCell(nctx, cx * 24 + 4, cy * 24 + 16, g.next, 24);
        }

        setHud((h) => {
          const level = Math.floor(g.lines / 10);
          const seconds = Math.floor((g.frame * FRAME_MS) / 1000);
          return h.score !== g.score || h.lines !== g.lines || h.level !== level ||
            h.over !== g.over || h.seconds !== seconds || !h.started
            ? { score: g.score, lines: g.lines, level, over: g.over, started: true, seconds }
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
        title="Frogris"
        desc="The falling-block episode. Arrows to move, ↑ to rotate, space to drop. Every run is replayed and verified on the server before it can rank."
      />
      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="panel panel-glow game-stage p-5 flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6">
          <AmbientPond />
          <div className="relative order-1 sm:order-none">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="frogris-canvas rounded-lg border block mx-auto"
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
                {hud.started && hud.score + hud.lines > 0 && (
                  <div className="text-center mb-4">
                    <div className="stat-number text-2xl text-neon mb-2">
                      {hud.score} pts
                    </div>
                    <div className="text-xs space-x-3" style={{ color: "var(--text-dim)" }}>
                      <span>{hud.lines} lines</span>
                      <span>level {hud.level}</span>
                      <span>{mmss}</span>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary btn-lg px-9" onClick={start}>
                  {hud.started && hud.score + hud.lines > 0 ? "Play again" : "Start"}
                </button>
                {!me.signedIn && (
                  <p className="text-fog text-xs mt-3 px-8 text-center">
                    Practice run — sign in and spend $RIBBIT on credits to compete for prizes.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex sm:flex-col gap-5 items-center sm:items-start order-3 sm:order-none">
            <div>
              <div className="kicker mb-1.5">Next</div>
              <canvas
                ref={nextRef}
                width={104}
                height={104}
                className="rounded-md border"
                style={{ borderColor: "var(--hairline)", width: 104, height: 104 }}
              />
            </div>
            <div className="space-y-3">
              {[
                ["Score", hud.score],
                ["Lines", hud.lines],
                ["Level", hud.level],
                ["Time", hud.started && !hud.over ? mmss : "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="kicker !text-[0.6rem]">{label}</div>
                  <div className="stat-number text-neon text-lg">{value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Mobile controls */}
          <div className="grid grid-cols-5 gap-2 sm:hidden w-full order-2">
            <button className="btn btn-ghost" onClick={() => enqueue(0)} aria-label="Move left">←</button>
            <button className="btn btn-ghost" onClick={() => enqueue(4)} aria-label="Soft drop">↓</button>
            <button className="btn btn-ghost" onClick={() => enqueue(1)} aria-label="Move right">→</button>
            <button className="btn btn-ghost" onClick={() => enqueue(2)} aria-label="Rotate">⟳</button>
            <button className="btn btn-ghost" onClick={() => enqueue(5)} aria-label="Hard drop">⤓</button>
          </div>
          {submitMsg && (
            <div className="w-full sm:hidden order-4">
              <Notice kind="ok">{submitMsg}</Notice>
            </div>
          )}
        </div>

        <div className="space-y-6">
        <aside className="panel p-5 h-fit lg:sticky lg:top-24">
          <ArcadeBountyHeader game="frogris" />
          <div className="kicker mb-1.5">Weekly leaderboard</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Best replay-verified score per hunter, last 7 days.{" "}
            <Link href="/bounties" className="text-neon hover:underline">
              All bounties →
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
          <div className="mt-5 pt-4 border-t hidden sm:block" style={{ borderColor: "var(--hairline)" }}>
            <div className="kicker !text-[0.6rem] mb-2">Keys</div>
            <div className="text-xs space-y-1.5" style={{ color: "var(--text-dim)" }}>
              <div><span className="mono text-frost">← →</span> move · <span className="mono text-frost">↑ / X · Z</span> rotate</div>
              <div><span className="mono text-frost">↓</span> soft drop · <span className="mono text-frost">Space</span> hard drop</div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
