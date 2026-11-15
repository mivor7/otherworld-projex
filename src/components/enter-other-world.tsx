"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SealMark } from "@/components/seal";
import { celebrate } from "@/components/confetti";
import { ARCADE, CAR_COLORS } from "@/lib/arcade-palette";
import {
  HCOLS,
  HROWS,
  HCELL,
  HW,
  HFRAME_MS,
  type HopperState,
  createHopper,
  hopperHop,
  hopperFrame,
} from "@/lib/hopper-sim";

export type ActIndex = 0 | 1 | 2 | 3 | 4;

interface ActMeta {
  id: ActIndex;
  roman: string;
  code: string;
  chipLabel: string;
  kicker: string;
  title: string;
  subtitle: string;
  liveHref: string;
  liveCta: string;
}

const ACTS: ActMeta[] = [
  {
    id: 0,
    roman: "ACT I",
    code: "01",
    chipLabel: "The Gate & $OWP",
    kicker: "Act I · Cryptographic Gate & Treasury Desk",
    title: "One free signature opens the vault. Instant $OWP from the house.",
    subtitle:
      "Connect Phantom or Solflare with a gasless message signature — no email, no password. Swap SOL on the homepage desk at the live Raydium spot price or deposit $OWP 1:1 into your balance.",
    liveHref: "#buy",
    liveCta: "Open Buy $OWP Desk →",
  },
  {
    id: 1,
    roman: "ACT II",
    code: "02",
    chipLabel: "Velvet Tables",
    kicker: "Act II · Wing I — Provably-Fair Tables (4% Edge)",
    title: "3D Frog Flip & Pond Dice — every hand verified by SHA-256.",
    subtitle:
      "Wager $OWP from your balance at a published 4% house edge. Every round locks a cryptographic server seed hash before you bet and reveals the preimage after so anyone can verify the outcome.",
    liveHref: "/games/flip",
    liveCta: "Play Frog Flip Live →",
  },
  {
    id: 2,
    roman: "ACT III",
    code: "03",
    chipLabel: "60 Hz Arcade",
    kicker: "Act III · Wing I — Free Replay-Verified Arcade",
    title: "Free-to-play classics protected by 60 Hz deterministic server replay.",
    subtitle:
      "Hopper, Frogris, and Worm Frog cost nothing to enter. Every keystroke is recorded with its frame index and re-simulated at 60 Hz on the server so bots can never fake a leaderboard run.",
    liveHref: "/games/hopper",
    liveCta: "Play Free Hopper →",
  },
  {
    id: 3,
    roman: "ACT IV",
    code: "04",
    chipLabel: "Bounty Loop",
    kicker: "Act IV · Wing III — Self-Filling Bounty Pools",
    title: "50% of the house edge feeds live bounties that pay out automatically.",
    subtitle:
      "Every table wager grows that game's active bounty pool. The moment the unlock meter hits 100%, the treasury credits every eligible hunter pro-rata — automatically, with zero claim gas.",
    liveHref: "/bounties",
    liveCta: "Explore Bounty Board →",
  },
  {
    id: 4,
    roman: "ACT V",
    code: "05",
    chipLabel: "Auction & Vault",
    kicker: "Act V · Wing II — Escrowed Auctions & Instant Withdrawals",
    title: "Bid on 1/1 lots and withdraw your $OWP on-chain anytime.",
    subtitle:
      "Auction bids are escrowed in $OWP with instant outbid refunds and 2-minute anti-snipe protection. When you're ready to cash out, the same treasury wallet sends $OWP straight to your wallet.",
    liveHref: "/auctions",
    liveCta: "Enter Auction House →",
  },
];

const ACT_DURATION_MS = 11500;
const W = HW;
const H = HROWS * HCELL;

/**
 * Smart Lookahead AI Pilot for Act III's live 60 Hz Hopper canvas.
 * Checks upcoming traffic in the target row and sidesteps cars so the cinema
 * showcase executes a clean, thrilling crossing every time.
 */
function isCellSafeInFrames(
  g: HopperState,
  col: number,
  row: number,
  lookaheadFrames: number
): boolean {
  if (row <= 0 || row >= HROWS - 1 || row === Math.floor(HROWS / 2)) return true;
  const fx = col * HCELL + HCELL / 2;
  for (const car of g.cars) {
    if (car.lane !== row) continue;
    for (let f = 0; f <= lookaheadFrames; f += 2) {
      let cx = car.x + car.speed * f;
      if (car.speed > 0 && cx > HW + 20) cx -= HW + car.len + 40;
      if (car.speed < 0 && cx < -car.len - 20) cx += HW + car.len + 40;
      if (fx > cx - 18 && fx < cx + car.len + 18) {
        return false;
      }
    }
  }
  return true;
}

function chooseSmartHop(g: HopperState): { dir: number; label: string } | null {
  const { col, row } = g.frog;
  const nextRow = Math.max(0, row - 1);
  // 1. Prefer hopping straight UP if clear for the next 16 frames
  if (isCellSafeInFrames(g, col, nextRow, 16)) {
    return { dir: 0, label: "HOP ↑ ADVANCE" };
  }
  // 2. If current cell is about to be hit or UP is blocked, sidestep toward a clear column
  const candidates: { dir: number; col: number; label: string }[] = [];
  if (col > 1) candidates.push({ dir: 2, col: col - 1, label: "HOP ← DODGE" });
  if (col < HCOLS - 2) candidates.push({ dir: 3, col: col + 1, label: "HOP → DODGE" });
  for (const c of candidates) {
    if (
      isCellSafeInFrames(g, c.col, row, 14) &&
      isCellSafeInFrames(g, c.col, nextRow, 12)
    ) {
      return { dir: c.dir, label: c.label };
    }
  }
  for (const c of candidates) {
    if (isCellSafeInFrames(g, c.col, row, 12)) {
      return { dir: c.dir, label: c.label };
    }
  }
  return null;
}

export function EnterOtherWorld() {
  const [open, setOpen] = useState(false);
  const [vaultPhase, setVaultPhase] = useState<"closed" | "parting" | "open">("open");
  const [act, setAct] = useState<ActIndex>(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [actProgress, setActProgress] = useState(0);
  const [titleCard, setTitleCard] = useState(false);
  const [launcherCoinDeg, setLauncherCoinDeg] = useState(0);

  // Stage-relative Autonomous Co-Pilot Cursor (in % of the stage box)
  const [cursor, setCursor] = useState<{
    x: number;
    y: number;
    label: string;
    clicking: boolean;
  }>({
    x: 28,
    y: 52,
    label: "READY",
    clicking: false,
  });

  // Live synchronized subtitle caption
  const [narration, setNarration] = useState(ACTS[0].subtitle);

  // Act I interactive states
  const [walletSigned, setWalletSigned] = useState(false);
  const [solAmount, setSolAmount] = useState(0.5);
  const [balanceOwp, setBalanceOwp] = useState(0);
  const [swapConfirmed, setSwapConfirmed] = useState(false);

  // Act II interactive states (Frog Flip + Pond Dice)
  const [flipCall, setFlipCall] = useState<"frog" | "fly">("frog");
  const [coinSpinning, setCoinSpinning] = useState(false);
  const [coinDeg, setCoinDeg] = useState(0);
  const [flipWinBanner, setFlipWinBanner] = useState<string | null>(null);
  const [flipStreak, setFlipStreak] = useState(1);

  const [diceTarget, setDiceTarget] = useState(50);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<{ rolled: number; payout: number } | null>(
    null
  );

  // Act III interactive states (60 Hz Hopper Canvas + Replay Trace)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hopperRef = useRef<HopperState | null>(null);
  const frogImgRef = useRef<HTMLImageElement | null>(null);
  const [hopperHud, setHopperHud] = useState({ score: 0, wave: 1 });
  const [replayTrace, setReplayTrace] = useState<
    { frame: number; dir: string; hash: string }[]
  >([
    { frame: 12, dir: "UP (0)", hash: "a4f9…81c2" },
    { frame: 26, dir: "UP (0)", hash: "7c12…e09a" },
  ]);

  // Act IV interactive states (Self-Filling Bounty Pool)
  const [bountyPct, setBountyPct] = useState(74);
  const [bountyUnlocked, setBountyUnlocked] = useState(false);

  // Act V interactive states (Auction House + Instant On-Chain Withdrawal)
  const [topBid, setTopBid] = useState(12500);
  const [userIsHighBidder, setUserIsHighBidder] = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);

  const timersRef = useRef<number[]>([]);
  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // Gentle 3D coin rotation on the homepage launcher banner
  useEffect(() => {
    const id = window.setInterval(() => {
      setLauncherCoinDeg((d) => d + 180);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  // Preload Hopper frog sprite once
  useEffect(() => {
    const img = new Image();
    img.src = "/art/owp_hopper_frog.png";
    frogImgRef.current = img;
  }, []);

  const triggerActTitleCard = useCallback(() => {
    setTitleCard(true);
    const id = window.setTimeout(() => setTitleCard(false), 950);
    timersRef.current.push(id);
  }, []);

  const openCinema = useCallback(
    (initialAct: ActIndex = 0) => {
      clearAllTimers();
      setAct(initialAct);
      setActProgress(0);
      setAutoPlay(true);
      setOpen(true);
      setVaultPhase("closed");

      const t1 = window.setTimeout(() => setVaultPhase("parting"), 550);
      const t2 = window.setTimeout(() => {
        setVaultPhase("open");
        triggerActTitleCard();
      }, 1450);
      timersRef.current.push(t1, t2);
    },
    [clearAllTimers, triggerActTitleCard]
  );

  const closeCinema = useCallback(() => {
    clearAllTimers();
    setOpen(false);
    setVaultPhase("open");
  }, [clearAllTimers]);

  const selectAct = useCallback(
    (nextAct: ActIndex, keepAuto = false) => {
      clearAllTimers();
      setAct(nextAct);
      setActProgress(0);
      setAutoPlay(keepAuto);
      triggerActTitleCard();
    },
    [clearAllTimers, triggerActTitleCard]
  );

  // Escape & Arrow keys inside Cinema Theater
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCinema();
      } else if (act === 2 && hopperRef.current) {
        // Allow user to play Hopper live with Arrow keys / WASD during Act III!
        const map: Record<string, number> = {
          ArrowUp: 0,
          w: 0,
          ArrowDown: 1,
          s: 1,
          ArrowLeft: 2,
          a: 2,
          ArrowRight: 3,
          d: 3,
        };
        if (map[e.key] !== undefined) {
          e.preventDefault();
          hopperHop(hopperRef.current, map[e.key]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, act, closeCinema]);

  // Continuous film reel progress bar & automatic Act advance
  useEffect(() => {
    if (!open || vaultPhase !== "open" || !autoPlay) return;
    const startMs = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - startMs;
      const pct = Math.min(100, (elapsed / ACT_DURATION_MS) * 100);
      setActProgress(pct);
      if (elapsed >= ACT_DURATION_MS) {
        window.clearInterval(id);
        setAct((prev) => ((prev + 1) % ACTS.length) as ActIndex);
        setActProgress(0);
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [open, vaultPhase, autoPlay, act]);

  // Helper to move cursor and click with a ripple
  const moveCursor = useCallback(
    (x: number, y: number, label: string, onArrive?: () => void) => {
      setCursor({ x, y, label, clicking: false });
      if (onArrive) {
        schedule(() => {
          setCursor({ x, y, label, clicking: true });
          onArrive();
          schedule(() => {
            setCursor((c) => ({ ...c, clicking: false }));
          }, 340);
        }, 480);
      }
    },
    [schedule]
  );

  // Choreographed Cinema Timeline for each Act
  useEffect(() => {
    if (!open || vaultPhase !== "open") return;
    clearAllTimers();

    const meta = ACTS[act];
    setNarration(meta.subtitle);

    if (act === 0) {
      // ACT I: Wallet Gate & Treasury Swap Desk
      setWalletSigned(false);
      setSolAmount(0.1);
      setSwapConfirmed(false);
      setBalanceOwp(0);
      setCursor({ x: 25, y: 68, label: "1 · SIGN MESSAGE", clicking: false });

      schedule(() => {
        moveCursor(26, 72, "SIGN · 0.00 SOL GAS", () => {
          setWalletSigned(true);
          setNarration(
            "Step 1 complete: Wallet 7xKp…9mQv authenticated via off-chain ed25519 signature (0 gas)."
          );
        });
      }, 900);

      schedule(() => {
        moveCursor(66, 58, "SELECT · 0.5 SOL", () => {
          setSolAmount(0.5);
          setNarration(
            "Live Raydium quote: 0.50 SOL locks in 12,500 $OWP from the house treasury wallet."
          );
        });
      }, 3600);

      schedule(() => {
        moveCursor(74, 58, "SELECT · 1.0 SOL", () => {
          setSolAmount(1);
          setNarration(
            "Scaling to 1.00 SOL → 25,000 $OWP ready to dispatch from the house treasury."
          );
        });
      }, 5800);

      schedule(() => {
        moveCursor(74, 76, "BUY · 25,000 $OWP", () => {
          setSwapConfirmed(true);
          setBalanceOwp(25000);
          celebrate();
          setNarration(
            "Confirmed on Solana: +25,000 $OWP credited to your playable house balance."
          );
        });
      }, 8000);
    } else if (act === 1) {
      // ACT II: Frog Flip & Pond Dice
      setBalanceOwp(25000);
      setFlipCall("frog");
      setFlipWinBanner(null);
      setDiceTarget(50);
      setDiceResult(null);
      setCursor({ x: 24, y: 64, label: "CALL · 🐸 FROG", clicking: false });

      schedule(() => {
        moveCursor(22, 66, "CALL · 🐸 FROG", () => {
          setFlipCall("frog");
        });
      }, 700);

      schedule(() => {
        moveCursor(27, 82, "FLIP · 500 $OWP", () => {
          setCoinSpinning(true);
          setFlipWinBanner(null);
          setNarration(
            "Flipping the 3D Frog/Fly coin — SHA-256 server seed hash committed before the toss…"
          );
          schedule(() => {
            setCoinSpinning(false);
            setCoinDeg((d) => d + 1440);
            setFlipStreak(2);
            setFlipWinBanner("🔥 2 in a row — +960 $OWP (1.92×)");
            setBalanceOwp(25460);
            celebrate();
            setNarration(
              "Landed FROG! +960 $OWP paid at 1.92× (published 4% edge, SHA-256 verified)."
            );
          }, 950);
        });
      }, 2000);

      schedule(() => {
        moveCursor(68, 54, "DIAL · WIN ZONE < 32", () => {
          setDiceTarget(32);
          setNarration(
            "Pond Dice: tightening the win-zone line to < 32 raises the payout multiplier to 3.00×."
          );
        });
      }, 5400);

      schedule(() => {
        moveCursor(73, 82, "ROLL · 1,000 $OWP", () => {
          setDiceRolling(true);
          setDiceResult(null);
          schedule(() => {
            setDiceRolling(false);
            setDiceResult({ rolled: 14.2, payout: 3000 });
            setBalanceOwp(27460);
            celebrate();
            setNarration(
              "Rolled 14.20 (< 32)! +3,000 $OWP won at 3.00× — and 50% of the edge fed the bounty pool."
            );
          }, 850);
        });
      }, 7300);
    } else if (act === 2) {
      // ACT III: 60 Hz Hopper Canvas & Server Replay
      setCursor({ x: 30, y: 55, label: "60 HZ AUTO-PILOT", clicking: false });
      setNarration(
        "Live 60 Hz Hopper simulation: every directional hop is recorded and re-verified on the server."
      );
    } else if (act === 3) {
      // ACT IV: Self-Filling Bounty Pools
      setBountyPct(78);
      setBountyUnlocked(false);
      setCursor({ x: 28, y: 74, label: "FEED BOUNTY POT", clicking: false });

      schedule(() => {
        moveCursor(28, 76, "WAGER → +50% EDGE TO POT", () => {
          setBountyPct(92);
          setNarration(
            "Half of the house edge from every table round flows straight into that game's bounty pool…"
          );
        });
      }, 1500);

      schedule(() => {
        moveCursor(28, 76, "UNLOCK 100,000 $OWP POOL", () => {
          setBountyPct(100);
          setBountyUnlocked(true);
          setBalanceOwp(77460);
          celebrate();
          setNarration(
            "100% UNLOCKED! The 100,000 $OWP pool automatically pays top hunters pro-rata on the spot."
          );
        });
      }, 4800);
    } else if (act === 4) {
      // ACT V: Auction House & Auto-Withdrawals
      setTopBid(12500);
      setUserIsHighBidder(false);
      setWithdrawDone(false);
      setBalanceOwp(77460);
      setCursor({ x: 27, y: 78, label: "PLACE ESCROWED BID", clicking: false });

      schedule(() => {
        moveCursor(27, 80, "BID · 15,000 $OWP", () => {
          setTopBid(15000);
          setUserIsHighBidder(true);
          setBalanceOwp(62460);
          setNarration(
            "Bid escrowed at 15,000 $OWP! The previous high bidder is refunded to their balance immediately."
          );
        });
      }, 1600);

      schedule(() => {
        moveCursor(73, 76, "WITHDRAW · 62,460 $OWP", () => {
          setWithdrawDone(true);
          setBalanceOwp(0);
          celebrate();
          setNarration(
            "Instant self-custody payout: the house treasury signs and sends 62,460 $OWP straight to your wallet."
          );
        });
      }, 5400);
    }

    return () => clearAllTimers();
  }, [open, vaultPhase, act, clearAllTimers, schedule, moveCursor]);

  // Live 60 Hz Hopper Canvas Loop with Smart Car-Dodging AI during Act III
  useEffect(() => {
    if (!open || act !== 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = createHopper(7771337);
    hopperRef.current = g;

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      acc += now - last;
      if (acc > 200) acc = 200;
      last = now;

      while (acc >= HFRAME_MS) {
        acc -= HFRAME_MS;

        // Smart AI pilot hops every 14 frames (~230ms)
        if (g.frame > 0 && g.frame % 14 === 0) {
          const move = chooseSmartHop(g);
          if (move) {
            const prevWave = g.level;
            hopperHop(g, move.dir);
            setHopperHud({ score: g.score, wave: g.level + 1 });
            if (g.level > prevWave) {
              celebrate();
            }
            const dirNames = ["UP (0)", "DOWN (1)", "LEFT (2)", "RIGHT (3)"];
            const hashHex = ((g.frame * 2654435761) >>> 0)
              .toString(16)
              .padStart(8, "0");
            setReplayTrace((prev) => [
              {
                frame: g.frame,
                dir: dirNames[move.dir] ?? "UP (0)",
                hash: `${hashHex.slice(0, 4)}…${hashHex.slice(-4)}`,
              },
              ...prev.slice(0, 4),
            ]);
          }
        }

        hopperFrame(g);
        // Keep demo run alive cleanly if a fast car ever clips the edge
        if (g.lives < 3) {
          g.lives = 3;
          g.over = false;
        }
      }

      // Render authentic Hopper board
      ctx.fillStyle = ARCADE.bg;
      ctx.fillRect(0, 0, W, H);
      const isSafeRow = (r: number) =>
        r === 0 || r === HROWS - 1 || r === Math.floor(HROWS / 2);

      for (let r = 0; r < HROWS; r++) {
        if (isSafeRow(r)) {
          const verge = ctx.createLinearGradient(0, r * HCELL, 0, (r + 1) * HCELL);
          verge.addColorStop(0, "oklch(0.78 0.11 150 / 0.12)");
          verge.addColorStop(1, "oklch(0.78 0.11 150 / 0.05)");
          ctx.fillStyle = verge;
          ctx.fillRect(0, r * HCELL, W, HCELL - 1);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(0, r * HCELL, W, HCELL - 1);
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
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
      ctx.textAlign = "right";
      ctx.fillText(`WAVE ${g.level + 1}`, W - 10, HCELL - 17);
      ctx.textAlign = "left";

      // Draw Cars
      g.cars.forEach((car, i) => {
        const color = CAR_COLORS[(car.lane + i) % CAR_COLORS.length];
        const cy = car.lane * HCELL;
        const bodyY = cy + 8;
        const bodyH = HCELL - 17;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.roundRect(car.x + 2, bodyY + 4, car.len, bodyH, 7);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(car.x, bodyY, car.len, bodyH, 7);
        ctx.fill();

        const fwd = car.speed > 0;
        const cabinW = Math.min(car.len * 0.34, 30);
        const cabinX = fwd ? car.x + car.len - cabinW - 8 : car.x + 8;
        ctx.fillStyle = "rgba(6,12,10,0.55)";
        ctx.beginPath();
        ctx.roundRect(cabinX, bodyY + 4, cabinW, bodyH - 8, 4);
        ctx.fill();
      });

      // Draw Frog
      const sinceHop = g.frame - g.lastHopFrame;
      const hopT = sinceHop < 6 ? Math.sin((sinceHop / 6) * Math.PI) : 0;
      const fx2 = g.frog.col * HCELL + HCELL / 2;
      const fy2 = g.frog.row * HCELL + HCELL / 2 + 1;

      ctx.save();
      ctx.translate(fx2, fy2 - hopT * 5);
      ctx.scale(1 + hopT * 0.08, 1 + hopT * 0.14);
      const sprite = frogImgRef.current;
      if (sprite && sprite.complete && sprite.naturalWidth) {
        const d = HCELL + 6;
        ctx.drawImage(sprite, -d / 2, -d / 2, d, d);
      } else {
        ctx.fillStyle = "oklch(0.78 0.11 150)";
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, act]);

  // Manual interactive triggers inside the stage so the user can play with every Act
  const triggerManualFlip = () => {
    if (coinSpinning) return;
    setAutoPlay(false);
    setCoinSpinning(true);
    setFlipWinBanner(null);
    window.setTimeout(() => {
      setCoinSpinning(false);
      setCoinDeg((d) => d + 1440 + (flipCall === "fly" ? 180 : 0));
      setFlipStreak((s) => s + 1);
      setFlipWinBanner(`🔥 ${flipStreak + 1}× Streak — +960 $OWP!`);
      setBalanceOwp((b) => b + 960);
      celebrate();
    }, 850);
  };

  const triggerManualRoll = () => {
    if (diceRolling) return;
    setAutoPlay(false);
    setDiceRolling(true);
    setDiceResult(null);
    const mult = Math.max(1.02, Math.floor((96 / Math.max(2, diceTarget)) * 100) / 100);
    const winRoll = Math.max(1.1, Math.round((diceTarget * 0.42 + Math.random() * 4) * 10) / 10);
    const payout = Math.floor(1000 * mult);
    window.setTimeout(() => {
      setDiceRolling(false);
      setDiceResult({ rolled: winRoll, payout });
      setBalanceOwp((b) => b + payout);
      celebrate();
    }, 750);
  };

  const currentAct = ACTS[act];
  const diceMult = Math.max(1.02, Math.floor((96 / Math.max(2, diceTarget)) * 100) / 100);

  return (
    <>
      {/* ═══ HOMEPAGE CINEMATIC LAUNCHER STRIP ═══ */}
      <section className="mt-8" aria-label="Enter the Other World interactive film">
        <div
          className="panel panel-glow panel-etched p-5 sm:p-7 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, oklch(0.78 0.11 150 / 0.1), transparent 55%), radial-gradient(100% 120% at 100% 100%, oklch(0.8 0.1 85 / 0.08), transparent 55%), var(--color-surface)",
          }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4 sm:gap-5">
              {/* 3D Spinning Frog/Fly Coin Emblem */}
              <button
                type="button"
                onClick={() => openCinema(0)}
                aria-label="Enter the Other World interactive film"
                className="shrink-0 relative cursor-pointer group"
                style={{ width: 72, height: 72, perspective: "600px" }}
              >
                <div
                  className="w-full h-full relative"
                  style={{
                    transformStyle: "preserve-3d",
                    transition: "transform 1.15s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: `rotateY(${launcherCoinDeg}deg)`,
                  }}
                >
                  <div className="coin-face coin-face--front">
                    <img
                      src="/art/owp_coin_frog.png"
                      alt="OWP Frog Coin"
                      className="coin-face-art"
                    />
                    <span className="coin-face-sheen" aria-hidden />
                  </div>
                  <div className="coin-face coin-face--back">
                    <img
                      src="/art/owp_coin_fly.png"
                      alt="OWP Fly Coin"
                      className="coin-face-art"
                    />
                    <span className="coin-face-sheen" aria-hidden />
                  </div>
                </div>
              </button>

              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="badge badge-live">
                    <span className="live-dot" /> Interactive Featurette
                  </span>
                  <span className="kicker !text-[0.62rem]">
                    5 Acts · Widescreen Live Simulation
                  </span>
                </div>

                <h2 className="text-[1.4rem] sm:text-[1.65rem] tracking-tight">
                  Enter the <span className="text-neon">Other World</span>
                </h2>

                <p className="text-fog text-[0.875rem] leading-relaxed max-w-2xl mt-1">
                  Unlock the vault doors for a choreographed widescreen tour of the
                  house — watch live SOL → $OWP treasury swaps, 3D Frog Flip &amp;
                  Pond Dice wins, 60 Hz Hopper runs, self-filling bounty pools, and
                  instant on-chain payouts.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => openCinema(0)}
                className="btn btn-primary btn-lg"
              >
                Enter the Other World →
              </button>
              <span
                className="mono text-[0.65rem] text-center lg:text-right"
                style={{ color: "var(--text-dim)" }}
              >
                5-Act interactive cinema · Click any reel below
              </span>
            </div>
          </div>

          {/* 5 Act Reel Selector Chips */}
          <div
            className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div className="chips">
              {ACTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openCinema(a.id)}
                  className="chip"
                >
                  <span className="mono text-neon mr-1.5">{a.code}</span>
                  {a.chipLabel}
                </button>
              ))}
            </div>
            <span
              className="mono text-[0.66rem] hidden xl:inline"
              style={{ color: "var(--text-dim)" }}
            >
              Interactive stage · Play along at every stop
            </span>
          </div>
        </div>
      </section>

      {/* ═══ FULL-SCREEN WIDESCREEN CINEMA THEATER ═══ */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enter the Other World interactive cinema"
          className="fixed inset-0 z-[85] flex flex-col justify-between overflow-hidden select-none"
          style={{
            background:
              "radial-gradient(90% 60% at 50% 0%, oklch(0.78 0.11 150 / 0.11), transparent 65%), radial-gradient(85% 55% at 50% 100%, oklch(0.8 0.1 85 / 0.08), transparent 65%), oklch(0.075 0.008 270)",
          }}
        >
          {/* Subtle atmospheric circuit-mesh backdrop */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'url("/art/bg-mesh.jpg")',
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.09,
            }}
          />

          {/* ── MACHINED METAL VAULT DOORS OPENING SEQUENCE ── */}
          {vaultPhase !== "open" && (
            <div
              onClick={() => {
                setVaultPhase("open");
                triggerActTitleCard();
              }}
              className="fixed inset-0 z-[95] cursor-pointer overflow-hidden"
              style={{ perspective: "1400px" }}
            >
              <div
                className="vault-door vault-door--left"
                style={{
                  transition: "transform 0.9s cubic-bezier(0.76, 0, 0.18, 1)",
                  transform:
                    vaultPhase === "parting"
                      ? "translateX(-104%) rotateY(7deg)"
                      : "translateX(0) rotateY(0deg)",
                }}
              />
              <div
                className="vault-door vault-door--right"
                style={{
                  transition: "transform 0.9s cubic-bezier(0.76, 0, 0.18, 1)",
                  transform:
                    vaultPhase === "parting"
                      ? "translateX(104%) rotateY(-7deg)"
                      : "translateX(0) rotateY(0deg)",
                }}
              />
              <div
                className="vault-seam"
                style={{
                  opacity: vaultPhase === "parting" ? 0 : 0.9,
                  width: vaultPhase === "parting" ? 32 : 4,
                  transition: "all 0.55s ease-out",
                }}
              />
              <div
                className="vault-center"
                style={{
                  opacity: vaultPhase === "parting" ? 0 : 1,
                  transform:
                    vaultPhase === "parting"
                      ? "translate(-50%, -50%) scale(1.35)"
                      : "translate(-50%, -50%) scale(1)",
                  transition: "all 0.55s cubic-bezier(0.6, 0, 0.8, 1)",
                }}
              >
                <div className="vault-wheel">
                  <span
                    className="vault-wheel-ticks"
                    style={{
                      transform:
                        vaultPhase === "parting" ? "rotate(-90deg)" : "rotate(45deg)",
                      transition: "transform 0.8s cubic-bezier(0.34, 0.05, 0.14, 1.18)",
                    }}
                  />
                  <span className="vault-wheel-ring" />
                  <div className="vault-seal">
                    <SealMark size={92} />
                  </div>
                </div>
                <div className="vault-word">
                  <span className="vault-word-main">Enter the Other World</span>
                  <span
                    className="mono text-[0.65rem] uppercase tracking-[0.25em]"
                    style={{ color: "var(--color-neon)" }}
                  >
                    Unlocking the House Vault…
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── TOP CINEMA LETTERBOX & FILM REEL SCRUBBER BAR ── */}
          <header
            className="relative z-20 border-b px-4 sm:px-8 py-3"
            style={{
              background: "oklch(0.09 0.008 270 / 0.92)",
              backdropFilter: "blur(16px)",
              borderColor: "var(--hairline-strong)",
            }}
          >
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
              {/* Brand Lockup */}
              <div className="flex items-center gap-3">
                <SealMark size={32} />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold tracking-wider uppercase"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Enter the Other World
                    </span>
                    <span className="badge badge-gold !text-[0.58rem]">
                      Balance: {balanceOwp.toLocaleString()} $OWP
                    </span>
                  </div>
                  <div
                    className="mono text-[0.62rem]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {currentAct.kicker}
                  </div>
                </div>
              </div>

              {/* 5 Film Reel Progress Bars */}
              <div className="flex items-center gap-1.5 flex-1 max-w-md mx-2">
                {ACTS.map((a) => {
                  const isCurrent = a.id === act;
                  const isPast = a.id < act;
                  const fillPct = isPast ? 100 : isCurrent ? actProgress : 0;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectAct(a.id, false)}
                      className="group flex-1 text-left cursor-pointer"
                      title={`${a.roman}: ${a.chipLabel}`}
                    >
                      <div className="flex items-center justify-between mono text-[0.58rem] mb-1">
                        <span
                          className={
                            isCurrent
                              ? "text-neon font-semibold"
                              : "text-fog group-hover:text-frost"
                          }
                        >
                          {a.code}
                        </span>
                        <span className="hidden sm:inline truncate text-[0.56rem] text-fog/80 ml-1">
                          {a.chipLabel}
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: "oklch(1 0 0 / 0.1)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${fillPct}%`,
                            background:
                              "linear-gradient(90deg, var(--color-neon), var(--color-gold))",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Auto-Play & Exit Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoPlay((p) => !p)}
                  className="btn btn-ghost !py-1.5 !px-3 !text-xs mono"
                >
                  {autoPlay ? "⏸ Pause" : "▶ Auto-Play"}
                </button>
                <button
                  type="button"
                  onClick={closeCinema}
                  aria-label="Exit Enter the Other World"
                  className="btn btn-ghost !py-1.5 !px-3 !text-xs"
                >
                  Exit ✕
                </button>
              </div>
            </div>
          </header>

          {/* ── CENTER WIDESCREEN STAGE ── */}
          <div className="relative z-10 flex-1 overflow-y-auto flex items-center justify-center px-4 sm:px-8 py-4">
            <div className="relative w-full max-w-5xl">
              {/* Brief Cinematic Chapter Title Overlay on Act Switch */}
              {titleCard && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center rounded-2xl"
                  style={{
                    background: "oklch(0.08 0.008 270 / 0.84)",
                    backdropFilter: "blur(10px)",
                    animation: "lightbox-in 0.25s ease",
                  }}
                >
                  <span className="kicker mb-2">{currentAct.roman}</span>
                  <h3
                    className="text-2xl sm:text-4xl font-semibold tracking-tight text-center px-6"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {currentAct.chipLabel}
                  </h3>
                </div>
              )}

              {/* Stage-Relative Autonomous Co-Pilot Cursor */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-30"
                style={{
                  left: `${cursor.x}%`,
                  top: `${cursor.y}%`,
                  transition:
                    "left 560ms cubic-bezier(0.22, 1, 0.36, 1), top 560ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {cursor.clicking && (
                  <span
                    className="absolute -left-5 -top-5 w-10 h-10 rounded-full animate-ping"
                    style={{
                      border: "2px solid var(--color-neon)",
                      background: "oklch(0.78 0.11 150 / 0.28)",
                    }}
                  />
                )}
                <div
                  className="relative flex items-center gap-2"
                  style={{
                    transform: cursor.clicking ? "scale(0.86)" : "scale(1)",
                    transition: "transform 150ms ease",
                  }}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      filter: "drop-shadow(0 6px 14px oklch(0 0 0 / 0.85))",
                    }}
                  >
                    <path
                      d="M3.5 2.5L20 10.5L12.5 13L9.5 20.5L3.5 2.5Z"
                      fill="oklch(0.82 0.12 150)"
                      stroke="oklch(0.1 0.008 270)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    className="mono text-[0.62rem] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{
                      background: "oklch(0.11 0.009 270 / 0.96)",
                      border: "1px solid oklch(0.78 0.11 150 / 0.65)",
                      color: "var(--color-neon)",
                      boxShadow: "0 10px 28px oklch(0 0 0 / 0.75)",
                    }}
                  >
                    {cursor.label}
                  </span>
                </div>
              </div>

              {/* ── ACT I STAGE: THE GATE & TREASURY SWAP DESK ── */}
              {act === 0 && (
                <div className="grid md:grid-cols-2 gap-5 items-stretch page-enter">
                  {/* Left: Cryptographic Wallet Gate */}
                  <div className="panel panel-glow panel-etched p-6 flex flex-col justify-between relative overflow-hidden">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="kicker">Step 01 · The Gate</span>
                        <span
                          className={`badge ${
                            walletSigned ? "badge-live" : "badge-portal"
                          }`}
                        >
                          {walletSigned ? (
                            <>
                              <span className="live-dot" /> Session Verified
                            </>
                          ) : (
                            "Awaiting Signature"
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-3.5 mb-4">
                        <SealMark size={48} />
                        <div>
                          <div className="text-base font-semibold">
                            Solana Wallet Authentication
                          </div>
                          <div className="mono text-xs text-fog">
                            Wallet: 7xKp…9mQv · Phantom / Solflare
                          </div>
                        </div>
                      </div>

                      <p className="text-fog text-sm leading-relaxed mb-5">
                        Other World Projex never asks for an email or password. A
                        single off-chain message signature proves ownership of your
                        Solana wallet at 0.00 SOL gas.
                      </p>

                      <div
                        className="rounded-lg p-3.5 mono text-xs mb-5 border"
                        style={{
                          background: "oklch(0.11 0.008 270)",
                          borderColor: "var(--hairline-strong)",
                        }}
                      >
                        <div style={{ color: "var(--text-dim)" }}>
                          MESSAGE TO SIGN
                        </div>
                        <div className="text-frost mt-1">
                          Sign in to Other World Projex · Nonce #849201
                        </div>
                        <div className="text-neon mt-1">
                          {walletSigned
                            ? "✓ ed25519 signature verified — session cookie issued"
                            : "▸ Click below to test wallet sign-in"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAutoPlay(false);
                        setWalletSigned(true);
                      }}
                      className={`btn w-full py-3 ${
                        walletSigned ? "btn-ghost" : "btn-primary"
                      }`}
                    >
                      {walletSigned
                        ? "✓ Connected as 7xKp…9mQv (0 Gas)"
                        : "Connect & Sign Message (Free)"}
                    </button>
                  </div>

                  {/* Right: Authentic Buy $OWP Treasury Desk */}
                  <div className="panel panel-glow p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">Step 02 · Buy $OWP</span>
                        <span className="badge badge-gold">Live Raydium Spot</span>
                      </div>

                      <h3 className="text-xl font-semibold mb-1.5">
                        Buy from the house wallet
                      </h3>
                      <p className="text-fog text-sm leading-relaxed mb-5">
                        Pay SOL from your wallet and the house treasury sends $OWP at
                        the live Raydium spot price — or deposit existing $OWP 1:1 into
                        your in-app balance.
                      </p>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="panel p-3">
                          <div className="kicker !text-[0.58rem] mb-1">You Pay</div>
                          <div className="stat-number text-lg text-frost">
                            {solAmount.toFixed(2)} SOL
                          </div>
                        </div>
                        <div className="panel p-3">
                          <div className="kicker !text-[0.58rem] mb-1">
                            You Receive
                          </div>
                          <div className="stat-number text-lg text-neon">
                            {(solAmount * 25000).toLocaleString()} $OWP
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-5">
                        {[0.1, 0.5, 1, 2].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setAutoPlay(false);
                              setSolAmount(n);
                            }}
                            className={`chip ${solAmount === n ? "active" : ""}`}
                          >
                            {n} SOL
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      {swapConfirmed && (
                        <div className="mb-3 rounded-lg px-3.5 py-2 text-xs mono text-neon border border-neon/40 bg-neon/10">
                          ✓ Payment confirmed! +{(solAmount * 25000).toLocaleString()}{" "}
                          $OWP credited to your playable balance.
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAutoPlay(false);
                          setSwapConfirmed(true);
                          setBalanceOwp((b) => b + solAmount * 25000);
                          celebrate();
                        }}
                        className="btn btn-primary w-full py-3"
                      >
                        Buy {(solAmount * 25000).toLocaleString()} $OWP with{" "}
                        {solAmount} SOL
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACT II STAGE: FROG FLIP & POND DICE (AUTHENTIC TABLE UI) ── */}
              {act === 1 && (
                <div className="grid md:grid-cols-2 gap-5 items-stretch page-enter">
                  {/* Left: Authentic Frog Flip 3D Stage */}
                  <div className="panel panel-glow game-stage p-5 sm:p-6 text-center flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">Table 01 · Frog Flip</span>
                        <span className="badge badge-gold">
                          🔥 Streak {flipStreak}×
                        </span>
                      </div>

                      <div className="coin-stage my-2">
                        <div className="coin-scene" style={{ width: 122, height: 122 }}>
                          <div
                            className={`coin ${coinSpinning ? "coin--spin" : ""}`}
                            style={
                              coinSpinning
                                ? undefined
                                : { transform: `rotateY(${coinDeg}deg)` }
                            }
                          >
                            <div className="coin-face coin-face--front">
                              <img
                                src="/art/owp_coin_frog.png"
                                alt="Frog side"
                                className="coin-face-art"
                              />
                              <span className="coin-face-sheen" aria-hidden />
                            </div>
                            <div className="coin-face coin-face--back">
                              <img
                                src="/art/owp_coin_fly.png"
                                alt="Fly side"
                                className="coin-face-art"
                              />
                              <span className="coin-face-sheen" aria-hidden />
                            </div>
                          </div>
                        </div>
                        <div className="coin-cast" aria-hidden />
                      </div>

                      <div className="min-h-[2rem] flex items-center justify-center mb-3">
                        {flipWinBanner ? (
                          <span className="stat-number text-lg neon-text result-pop">
                            {flipWinBanner}
                          </span>
                        ) : (
                          <span className="text-xs text-fog">
                            Even odds · 1.92× payout · 4% published edge
                          </span>
                        )}
                      </div>

                      <div className="flex justify-center gap-3 mb-4">
                        {(["frog", "fly"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setAutoPlay(false);
                              setFlipCall(s);
                            }}
                            className={`btn px-6 ${
                              flipCall === s ? "btn-primary" : "btn-ghost"
                            }`}
                          >
                            {s === "frog" ? "🐸 Frog" : "🪰 Fly"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={triggerManualFlip}
                        className="btn btn-primary w-full py-3"
                      >
                        {coinSpinning
                          ? "Flipping in 3D…"
                          : "Flip for 500 $OWP → Win 960 $OWP"}
                      </button>
                      <div
                        className="mono text-[0.62rem] mt-2.5"
                        style={{ color: "var(--text-dim)" }}
                      >
                        seedHash 9f8a4c21e7b09d3a… · SHA-256 commit-reveal
                      </div>
                    </div>
                  </div>

                  {/* Right: Authentic Pond Dice Laser Track Stage */}
                  <div className="panel panel-glow game-stage p-5 sm:p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="kicker">Table 02 · Pond Dice</span>
                        <span className="badge badge-live">
                          <span className="live-dot" /> Custom Odds
                        </span>
                      </div>

                      {/* Result Track */}
                      <div
                        className="relative h-12 rounded-lg mb-2 overflow-hidden"
                        style={{
                          background:
                            "linear-gradient(180deg, oklch(0.13 0.01 165), oklch(0.16 0.012 165))",
                          border: "1px solid var(--hairline-strong)",
                          boxShadow: "inset 0 2px 10px oklch(0 0 0 / 0.45)",
                        }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 transition-all duration-300"
                          style={{
                            width: `${diceTarget}%`,
                            background:
                              "linear-gradient(90deg, oklch(0.78 0.11 150 / 0.08), oklch(0.78 0.11 150 / 0.24))",
                            borderRight: "2px solid var(--color-neon)",
                          }}
                        />
                        {diceRolling && <div className="dice-scan" aria-hidden />}
                        {diceResult && !diceRolling && (
                          <div
                            className="dice-marker absolute top-1/2"
                            style={{ left: `${diceResult.rolled}%` }}
                          >
                            <img
                              src="/art/owp_dice_orb.png"
                              alt=""
                              className="block w-7 h-7 -translate-x-1/2 -translate-y-1/2"
                              style={{
                                filter:
                                  "drop-shadow(0 0 10px oklch(0.78 0.11 150 / 0.95))",
                              }}
                            />
                          </div>
                        )}
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neon mono">
                          win zone &lt; {diceTarget}
                        </span>
                      </div>

                      <input
                        type="range"
                        min={5}
                        max={92}
                        value={diceTarget}
                        onChange={(e) => {
                          setAutoPlay(false);
                          setDiceTarget(Number(e.target.value));
                        }}
                        className="w-full accent-neon mb-4"
                      />

                      <div className="grid grid-cols-3 gap-2.5 text-center mb-4">
                        <div className="panel p-2.5">
                          <div className="text-[0.62rem] text-fog uppercase">
                            Win Chance
                          </div>
                          <div className="stat-number text-neon text-base">
                            {diceTarget}%
                          </div>
                        </div>
                        <div className="panel p-2.5">
                          <div className="text-[0.62rem] text-fog uppercase">
                            Multiplier
                          </div>
                          <div className="stat-number text-portal text-base">
                            {diceMult.toFixed(2)}×
                          </div>
                        </div>
                        <div className="panel p-2.5">
                          <div className="text-[0.62rem] text-fog uppercase">
                            Payout
                          </div>
                          <div className="stat-number text-gold text-base">
                            {Math.floor(1000 * diceMult).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="min-h-[1.75rem] text-center mb-2">
                        {diceResult && !diceRolling && (
                          <span className="stat-number text-lg neon-text result-pop">
                            rolled {diceResult.rolled.toFixed(2)} — +
                            {diceResult.payout.toLocaleString()} $OWP!
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={triggerManualRoll}
                        className="btn btn-primary w-full py-3"
                      >
                        {diceRolling
                          ? "Rolling across laser track…"
                          : `Roll 1,000 $OWP for ${diceMult.toFixed(2)}×`}
                      </button>
                      <div
                        className="mono text-[0.62rem] text-center mt-2.5"
                        style={{ color: "var(--text-dim)" }}
                      >
                        Drag slider or click Roll to test live odds
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACT III STAGE: 60 HZ HOPPER LIVE CANVAS & REPLAY VERIFIER ── */}
              {act === 2 && (
                <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-5 items-stretch page-enter">
                  {/* Left: Authentic 60 Hz Hopper Canvas driven by Smart AI + User Keys */}
                  <div className="panel panel-glow game-stage p-4 flex flex-col items-center justify-between">
                    <div className="w-full flex items-center justify-between mb-2 px-1">
                      <span className="kicker">Free Arcade · Hopper (60 Hz)</span>
                      <div className="flex items-center gap-4 mono text-xs">
                        <span>
                          Score{" "}
                          <strong className="text-neon">
                            {hopperHud.score}
                          </strong>
                        </span>
                        <span>
                          Wave{" "}
                          <strong className="text-gold">
                            {hopperHud.wave}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="relative w-full max-w-[356px]">
                      <canvas
                        ref={canvasRef}
                        width={W}
                        height={H}
                        className="rounded-lg border block mx-auto"
                        style={{
                          borderColor: "var(--hairline-strong)",
                          width: "100%",
                          maxWidth: 356,
                          height: "auto",
                        }}
                      />
                    </div>

                    {/* Interactive Hop Controls so user can hop the frog too */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="mono text-[0.62rem] text-fog mr-2">
                        Take control:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          hopperRef.current && hopperHop(hopperRef.current, 2)
                        }
                        className="btn btn-ghost !py-1 !px-3 !text-xs"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          hopperRef.current && hopperHop(hopperRef.current, 0)
                        }
                        className="btn btn-primary !py-1 !px-4 !text-xs"
                      >
                        ↑ Hop
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          hopperRef.current && hopperHop(hopperRef.current, 1)
                        }
                        className="btn btn-ghost !py-1 !px-3 !text-xs"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          hopperRef.current && hopperHop(hopperRef.current, 3)
                        }
                        className="btn btn-ghost !py-1 !px-3 !text-xs"
                      >
                        →
                      </button>
                    </div>
                  </div>

                  {/* Right: 60 Hz Server Replay Verifier & Free Episode Slate */}
                  <div className="panel panel-glow p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">Anti-Cheat Protocol</span>
                        <span className="badge badge-live">
                          <span className="live-dot" /> 60 Hz Replay Verified
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold mb-1.5">
                        Zero wager required. Pure human skill.
                      </h3>
                      <p className="text-fog text-xs sm:text-sm leading-relaxed mb-4">
                        Every arcade run seeds traffic from a signed server token and
                        records your exact frame-by-frame input trace. When your run
                        ends, the server re-simulates the entire game at 60 Hz before
                        posting your score to the weekly $OWP bounty board.
                      </p>

                      {/* Live Frame Trace Stream */}
                      <div
                        className="rounded-lg p-3 mono text-[0.66rem] mb-4 border"
                        style={{
                          background: "oklch(0.11 0.008 270)",
                          borderColor: "var(--hairline-strong)",
                        }}
                      >
                        <div className="flex items-center justify-between text-neon mb-1.5">
                          <span>LIVE INPUT TRACE STREAM</span>
                          <span>60.0 FPS LOCKED</span>
                        </div>
                        <div className="space-y-1">
                          {replayTrace.map((t, idx) => (
                            <div
                              key={`${t.frame}-${idx}`}
                              className="flex items-center justify-between text-fog"
                            >
                              <span>frame #{t.frame}</span>
                              <span className="text-frost">{t.dir}</span>
                              <span className="text-neon">✓ {t.hash}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Other Free Arcade Episodes */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="panel p-2.5 flex items-center gap-2.5">
                        <img
                          src="/art/owp_frogris.png"
                          alt="Frogris"
                          className="w-11 h-11 rounded object-cover"
                        />
                        <div>
                          <div className="text-xs font-semibold">Frogris</div>
                          <div className="mono text-[0.6rem] text-neon">
                            Free · Weekly Pool
                          </div>
                        </div>
                      </div>
                      <div className="panel p-2.5 flex items-center gap-2.5">
                        <img
                          src="/art/owp_worm.png"
                          alt="Worm Frog"
                          className="w-11 h-11 rounded object-cover"
                        />
                        <div>
                          <div className="text-xs font-semibold">Worm Frog</div>
                          <div className="mono text-[0.6rem] text-neon">
                            Free · Weekly Pool
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACT IV STAGE: SELF-FILLING BOUNTY POOLS ── */}
              {act === 3 && (
                <div className="grid md:grid-cols-2 gap-5 items-stretch page-enter">
                  {/* Left: House Edge -> Bounty Rakeback Engine */}
                  <div className="panel panel-glow panel-etched p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">The Treasury Loop</span>
                        <span className="badge badge-gold">
                          50% Edge → Bounty Pool
                        </span>
                      </div>

                      <h3 className="text-xl font-semibold mb-2">
                        Every table bet fuels that game&apos;s bounty.
                      </h3>
                      <p className="text-fog text-sm leading-relaxed mb-5">
                        Instead of keeping the full 4% table edge, the house routes
                        half of the edge from every Frog Flip, Pond Dice, and Blackjack
                        wager straight into that game&apos;s active bounty pool.
                      </p>

                      <div className="space-y-2.5 mb-5">
                        <div className="panel p-3 flex items-center justify-between">
                          <span className="text-xs text-fog">
                            1. Players wager $OWP at the tables
                          </span>
                          <span className="mono text-xs text-frost">
                            4.0% House Edge
                          </span>
                        </div>
                        <div className="panel p-3 flex items-center justify-between">
                          <span className="text-xs text-fog">
                            2. Half of the edge feeds the live bounty meter
                          </span>
                          <span className="mono text-xs text-neon">
                            +50% Rakeback to Pool
                          </span>
                        </div>
                        <div className="panel p-3 flex items-center justify-between">
                          <span className="text-xs text-fog">
                            3. Meter reaches 100% → Instant automatic payout
                          </span>
                          <span className="mono text-xs text-gold">
                            Pro-Rata to Winners
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAutoPlay(false);
                        setBountyPct((p) => {
                          const next = Math.min(100, p + 14);
                          if (next >= 100) {
                            setBountyUnlocked(true);
                            celebrate();
                          }
                          return next;
                        });
                      }}
                      className="btn btn-primary w-full py-3"
                    >
                      ⚡ Simulate Table Activity (+Fill Bounty Meter)
                    </button>
                  </div>

                  {/* Right: Live Bounty Contract & Automatic Payout Ledger */}
                  <div className="panel panel-glow p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3.5 mb-4">
                        <img
                          src="/art/owp_pump.png"
                          alt="Frog Flip Bounty"
                          className="w-14 h-14 rounded-lg object-cover border"
                          style={{ borderColor: "var(--hairline-strong)" }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="kicker !text-[0.58rem]">
                              Wing III · Active Contract
                            </span>
                            <span className="badge badge-live">
                              <span className="live-dot" />{" "}
                              {bountyUnlocked ? "Paid Out" : "Filling"}
                            </span>
                          </div>
                          <div className="text-lg font-semibold">
                            Frog Flip High-Roller Hunt
                          </div>
                          <div className="stat-number text-gold text-base">
                            100,000 $OWP Prize Pool
                          </div>
                        </div>
                      </div>

                      {/* Unlock Progress Meter */}
                      <div className="mb-4">
                        <div className="flex justify-between mono text-xs mb-1.5">
                          <span className="text-fog">Pool Unlock Meter</span>
                          <span className="text-neon font-semibold">
                            {bountyPct}% Unlocked
                          </span>
                        </div>
                        <div
                          className="h-3 w-full rounded-full overflow-hidden p-0.5"
                          style={{ background: "oklch(0.1 0.008 270)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${bountyPct}%`,
                              background:
                                "linear-gradient(90deg, var(--color-neon), var(--color-gold))",
                            }}
                          />
                        </div>
                      </div>

                      {/* Pro-Rata Standings / Automatic Payouts */}
                      <div className="kicker !text-[0.58rem] mb-2">
                        {bountyUnlocked
                          ? "✓ Automatic Pro-Rata Payouts Credited"
                          : "Live Hunter Standings (Pro-Rata Share)"}
                      </div>
                      <div className="space-y-2">
                        {[
                          {
                            rank: "01",
                            wallet: "7xKp…9mQv (You)",
                            share: "50%",
                            payout: "+50,000 $OWP",
                          },
                          {
                            rank: "02",
                            wallet: "4vBn…2kLp",
                            share: "30%",
                            payout: "+30,000 $OWP",
                          },
                          {
                            rank: "03",
                            wallet: "9pQr…8xWz",
                            share: "20%",
                            payout: "+20,000 $OWP",
                          },
                        ].map((row) => (
                          <div
                            key={row.rank}
                            className="panel px-3.5 py-2 flex items-center justify-between text-xs mono"
                          >
                            <span>
                              <span className="text-fog mr-2">#{row.rank}</span>
                              <span className="text-frost">{row.wallet}</span>
                            </span>
                            <span
                              className={
                                bountyUnlocked
                                  ? "text-gold font-semibold"
                                  : "text-neon"
                              }
                            >
                              {bountyUnlocked ? row.payout : `${row.share} share`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACT V STAGE: AUCTION HOUSE & INSTANT ON-CHAIN WITHDRAWALS ── */}
              {act === 4 && (
                <div className="grid md:grid-cols-2 gap-5 items-stretch page-enter">
                  {/* Left: Authentic Auction House Lot Card */}
                  <div className="panel panel-glow p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">Wing II · The Auction House</span>
                        <span className="badge badge-urgent">
                          Anti-Snipe Protected
                        </span>
                      </div>

                      <div className="lot-card mb-4">
                        <div className="card-media !aspect-[16/9]">
                          <img
                            src="/art/hero-auction.jpg"
                            alt="Genesis Crown"
                          />
                          <span className="badge badge-live absolute top-2 right-2">
                            <span className="live-dot" /> 1/1 Lot
                          </span>
                        </div>
                        <div className="card-body">
                          <div className="flex items-center justify-between">
                            <h3 className="!text-base">
                              The Sovereign Frog Reliquary (1/1)
                            </h3>
                            <span className="mono text-xs text-fog">04m : 12s</span>
                          </div>
                          <div className="card-price-row">
                            <div>
                              <div className="card-price-label">Current High Bid</div>
                              <div className="price text-neon">
                                {topBid.toLocaleString()} $OWP
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="card-price-label">Status</div>
                              <div className="mono text-xs text-gold">
                                {userIsHighBidder
                                  ? "✓ You lead (Escrowed)"
                                  : "Outbid auto-refunds"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAutoPlay(false);
                        setTopBid((b) => b + 2500);
                        setUserIsHighBidder(true);
                      }}
                      className="btn btn-primary w-full py-3"
                    >
                      Place Escrowed Bid ({(topBid + 2500).toLocaleString()} $OWP)
                    </button>
                  </div>

                  {/* Right: Instant Self-Custody Withdrawal & Direct Launchpad */}
                  <div className="panel panel-glow panel-etched p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="kicker">Self-Custody Treasury</span>
                        <span className="badge badge-live">
                          <span className="live-dot" /> Solana Mainnet
                        </span>
                      </div>

                      <h3 className="text-xl font-semibold mb-1.5">
                        Withdraw anytime. Paid automatically.
                      </h3>
                      <p className="text-fog text-sm leading-relaxed mb-4">
                        Your in-app balance is never locked. Request a withdrawal and
                        the same house treasury wallet automatically signs and
                        broadcasts your $OWP transfer on Solana.
                      </p>

                      <div className="panel p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="kicker !text-[0.58rem]">
                            Withdrawable Balance
                          </span>
                          <span className="mono text-xs text-neon">
                            0 Lockups · Instant Queue
                          </span>
                        </div>
                        <div className="stat-number text-2xl text-gold">
                          {withdrawDone ? "0 $OWP" : "62,460 $OWP"}
                        </div>
                        {withdrawDone && (
                          <div className="mt-2 mono text-xs text-neon">
                            ✓ 62,460 $OWP sent on-chain to 7xKp…9mQv (Tx confirmed in
                            1.1s)
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAutoPlay(false);
                          setWithdrawDone((w) => !w);
                          if (!withdrawDone) celebrate();
                        }}
                        className="btn btn-ghost w-full py-2.5 mb-5"
                      >
                        {withdrawDone
                          ? "✓ On-Chain Payout Confirmed (Click to Reset)"
                          : "Test Instant On-Chain Withdrawal (62,460 $OWP)"}
                      </button>
                    </div>

                    {/* Direct Launchpad into the Real App */}
                    <div>
                      <div className="kicker !text-[0.58rem] mb-2">
                        Ready to jump in? Choose your wing
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href="#buy"
                          onClick={closeCinema}
                          className="btn btn-primary !py-2 !text-xs text-center"
                        >
                          Buy $OWP →
                        </a>
                        <Link
                          href="/games/flip"
                          onClick={closeCinema}
                          className="btn btn-ghost !py-2 !text-xs text-center"
                        >
                          Play Frog Flip →
                        </Link>
                        <Link
                          href="/games/hopper"
                          onClick={closeCinema}
                          className="btn btn-ghost !py-2 !text-xs text-center"
                        >
                          Free Hopper →
                        </Link>
                        <Link
                          href="/bounties"
                          onClick={closeCinema}
                          className="btn btn-ghost !py-2 !text-xs text-center"
                        >
                          Bounty Board →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── BOTTOM CINEMA SUBTITLE & TRANSPORT LETTERBOX BAR ── */}
          <footer
            className="relative z-20 border-t px-4 sm:px-8 py-3.5"
            style={{
              background: "oklch(0.09 0.008 270 / 0.94)",
              backdropFilter: "blur(16px)",
              borderColor: "var(--hairline-strong)",
            }}
          >
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Synchronized Cinema Subtitle Track */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="mono text-[0.62rem] uppercase tracking-wider text-neon">
                    {currentAct.roman}
                  </span>
                  <span className="text-xs font-semibold text-frost truncate">
                    {currentAct.title}
                  </span>
                </div>
                <p className="text-fog text-xs sm:text-[0.82rem] leading-snug">
                  “{narration}”
                </p>
              </div>

              {/* Transport & Live Route Jump Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    selectAct(((act + ACTS.length - 1) % ACTS.length) as ActIndex, false)
                  }
                  className="btn btn-ghost !py-1.5 !px-3 !text-xs"
                >
                  ← Prev
                </button>

                {currentAct.liveHref.startsWith("#") ? (
                  <a
                    href={currentAct.liveHref}
                    onClick={closeCinema}
                    className="btn btn-ghost !py-1.5 !px-3 !text-xs text-neon"
                  >
                    {currentAct.liveCta}
                  </a>
                ) : (
                  <Link
                    href={currentAct.liveHref}
                    onClick={closeCinema}
                    className="btn btn-ghost !py-1.5 !px-3 !text-xs text-neon"
                  >
                    {currentAct.liveCta}
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() =>
                    selectAct(((act + 1) % ACTS.length) as ActIndex, true)
                  }
                  className="btn btn-primary !py-1.5 !px-3.5 !text-xs"
                >
                  {act < 4 ? "Next Act →" : "Replay Film ↺"}
                </button>
              </div>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}
