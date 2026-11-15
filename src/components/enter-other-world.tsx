"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type SceneId = 0 | 1 | 2 | 3 | 4;

interface SceneMeta {
  id: SceneId;
  code: string;
  shortTitle: string;
  kicker: string;
  title: string;
  speech: string;
  caption: string;
  highlights: { label: string; value: string }[];
  scrollTarget?: string;
}

const SCENES: SceneMeta[] = [
  {
    id: 0,
    code: "01",
    shortTitle: "The Gate & $OWP",
    kicker: "Act I · Sign In & Load Up",
    title: "One wallet signature. Instant $OWP from the house.",
    speech:
      "Psst! Welcome to the Other World. Watch my cursor: one free wallet signature opens the vault, and swapping SOL sends $OWP straight into your playable balance!",
    caption:
      "Connect Phantom or Solflare with a gasless message signature — no email, no password. Buy $OWP with SOL at the live Raydium spot price or deposit $OWP 1:1 into your balance.",
    highlights: [
      { label: "Sign-in", value: "Free message sig" },
      { label: "Swap rate", value: "Live Raydium spot" },
      { label: "Deposit credit", value: "1 : 1 $OWP" },
    ],
    scrollTarget: "#buy",
  },
  {
    id: 1,
    code: "02",
    shortTitle: "Provably-Fair Tables",
    kicker: "Act II · Wing I — The Tables",
    title: "Flip the coin, roll the dice, verify every SHA-256 seed.",
    speech:
      "Now watch me call FROG for 500 $OWP! Every flip and dice roll commits a cryptographic SHA-256 hash before you bet — 96% RTP, zero house tricks. Click the coin to flip it yourself!",
    caption:
      "Wager $OWP directly from your balance on Frog Flip (1.92×), Pond Dice (up to 96×), and Blackjack (3:2 naturals). Every round publishes its server seed hash upfront so anyone can audit the math.",
    highlights: [
      { label: "House edge", value: "Published 4%" },
      { label: "Frog Flip payout", value: "1.92× instant" },
      { label: "Fairness", value: "SHA-256 commit-reveal" },
    ],
  },
  {
    id: 2,
    code: "03",
    shortTitle: "Free Skill Arcade",
    kicker: "Act III · Wing I — Free Arcade",
    title: "Free-to-play classics protected by 60 Hz server replay.",
    speech:
      "Don't want to wager a single token? Hop into Hopper, Frogris, or Worm Frog for FREE! Every keystroke is re-simulated at 60 Hz on the server so bots get squashed and real skill wins.",
    caption:
      "Play Hopper, Frogris, and Worm Frog at zero cost. Your inputs are recorded and deterministically replayed by the server before a high score or weekly episode bounty is awarded.",
    highlights: [
      { label: "Entry cost", value: "100% Free" },
      { label: "Anti-cheat", value: "60 Hz server replay" },
      { label: "Rewards", value: "Weekly $OWP episodes" },
    ],
  },
  {
    id: 3,
    code: "04",
    shortTitle: "Bounties & Auctions",
    kicker: "Act IV · Wings II & III — The Loop",
    title: "Half the house edge feeds live bounties that pay out automatically.",
    speech:
      "Here's the magic of the house: 50% of the edge from every table bet flows straight into that game's Bounty Pot! When the pot unlocks, top hunters get paid automatically — plus you can bid $OWP on 1/1 auctions!",
    caption:
      "Every wager grows the prize pool on that table. When a bounty's activity threshold is reached, the pool unlocks and credits every eligible winner pro-rata. In the Auction House, bids are escrowed in $OWP with instant outbid refunds.",
    highlights: [
      { label: "Pot rakeback", value: "50% of house edge" },
      { label: "Bounty payout", value: "Auto pro-rata" },
      { label: "Auction bids", value: "Escrowed + anti-snipe" },
    ],
  },
  {
    id: 4,
    code: "05",
    shortTitle: "Auto Cash-Out",
    kicker: "Act V · Self-Custody & Withdrawals",
    title: "Withdraw anytime. The same treasury wallet pays you on-chain.",
    speech:
      "Done hunting for the night? Click Withdraw and the house treasury sends your $OWP straight back to your Solana wallet automatically. No lockups, no waiting room. Ready to jump in?",
    caption:
      "Your balance is always yours to withdraw. Request a payout from your account drawer and the treasury signs and broadcasts the Solana transfer straight to your wallet.",
    highlights: [
      { label: "Withdrawals", value: "Automatic on-chain" },
      { label: "Lockups", value: "None — anytime" },
      { label: "Network", value: "Solana Mainnet" },
    ],
  },
];

const SCENE_DURATION_MS = 9500;

/**
 * Cartoon Frog Mascot SVG ("Ribbit the Bounty Hunter")
 * Pure inline SVG so it loads instantaneously with zero external asset risk.
 */
function CartoonFrogMascot({
  mood,
  className = "w-20 h-20",
}: {
  mood: "wave" | "excited" | "gamer" | "rich" | "cool";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Subtle aura glow */}
      <circle cx="60" cy="64" r="48" fill="url(#frogAura)" opacity="0.35" />

      {/* Gold crown / hunter hat */}
      <path
        d="M38 30L46 16L60 26L74 16L82 30H38Z"
        fill="#EAB308"
        stroke="#18181B"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="15" r="3.5" fill="#FDE047" />
      <circle cx="60" cy="12" r="4" fill="#4ADE80" />
      <circle cx="74" cy="15" r="3.5" fill="#FDE047" />

      {/* Left & Right Eye Domes */}
      <circle
        cx="41"
        cy="42"
        r="14"
        fill="#22C55E"
        stroke="#14532D"
        strokeWidth="3.5"
      />
      <circle
        cx="79"
        cy="42"
        r="14"
        fill="#22C55E"
        stroke="#14532D"
        strokeWidth="3.5"
      />

      {/* Head / Body */}
      <ellipse
        cx="60"
        cy="68"
        rx="38"
        ry="30"
        fill="#22C55E"
        stroke="#14532D"
        strokeWidth="3.5"
      />

      {/* Cream Belly */}
      <ellipse cx="60" cy="76" rx="26" ry="18" fill="#DCFCE7" />

      {/* Eyes Whites */}
      <circle cx="41" cy="42" r="9.5" fill="#FFFFFF" />
      <circle cx="79" cy="42" r="9.5" fill="#FFFFFF" />

      {/* Pupils / Expressions */}
      {mood === "rich" ? (
        <>
          <text
            x="41"
            y="47"
            textAnchor="middle"
            fill="#15803D"
            fontSize="14"
            fontWeight="900"
            fontFamily="monospace"
          >
            $
          </text>
          <text
            x="79"
            y="47"
            textAnchor="middle"
            fill="#15803D"
            fontSize="14"
            fontWeight="900"
            fontFamily="monospace"
          >
            $
          </text>
        </>
      ) : mood === "cool" ? (
        <>
          {/* Deal-with-it shades */}
          <rect x="27" y="35" width="28" height="13" rx="3" fill="#09090B" />
          <rect x="65" y="35" width="28" height="13" rx="3" fill="#09090B" />
          <line
            x1="55"
            y1="40"
            x2="65"
            y2="40"
            stroke="#09090B"
            strokeWidth="3.5"
          />
          <line
            x1="31"
            y1="38"
            x2="39"
            y2="38"
            stroke="#4ADE80"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="69"
            y1="38"
            x2="77"
            y2="38"
            stroke="#4ADE80"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="43" cy="42" r="5" fill="#09090B" />
          <circle cx="81" cy="42" r="5" fill="#09090B" />
          <circle cx="45" cy="39.5" r="2" fill="#FFFFFF" />
          <circle cx="83" cy="39.5" r="2" fill="#FFFFFF" />
        </>
      )}

      {/* Rosy Cheeks */}
      <ellipse cx="31" cy="63" rx="5.5" ry="3.5" fill="#86EFAC" opacity="0.8" />
      <ellipse cx="89" cy="63" rx="5.5" ry="3.5" fill="#86EFAC" opacity="0.8" />

      {/* Mouth */}
      {mood === "excited" || mood === "rich" ? (
        <path
          d="M42 62C46 74 74 74 78 62Z"
          fill="#14532D"
          stroke="#14532D"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M43 63Q60 74 77 63"
          stroke="#14532D"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}

      {/* Tongue on excited */}
      {(mood === "excited" || mood === "rich") && (
        <ellipse cx="60" cy="69" rx="8" ry="4.5" fill="#FB7185" />
      )}

      {/* Collar / Gold Chain */}
      <path
        d="M37 86Q60 97 83 86"
        stroke="#EAB308"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="5 4"
      />
      <circle
        cx="60"
        cy="93"
        r="6"
        fill="#EAB308"
        stroke="#18181B"
        strokeWidth="2"
      />

      <defs>
        <radialGradient
          id="frogAura"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(60 64) scale(48)"
        >
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#4ADE80" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Animated Ghost Cursor SVG that moves to target coordinates and shows click ripples.
 */
function AnimatedCursor({
  x,
  y,
  clicking,
  label,
}: {
  x: string;
  y: string;
  clicking: boolean;
  label?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute z-30 transition-all duration-700 ease-out"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      {/* Click pulse ring */}
      {clicking && (
        <span className="absolute -left-3 -top-3 h-9 w-9 animate-ping rounded-full bg-[color:var(--color-neon)] opacity-60" />
      )}
      <div
        className={`relative flex items-center gap-1.5 transition-transform duration-200 ${
          clicking ? "scale-90" : "scale-100"
        }`}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 28 28"
          fill="none"
          className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.75)]"
        >
          <path
            d="M5 3L23 12.5L14.5 15L11.5 23.5L5 3Z"
            fill="#4ADE80"
            stroke="#09090B"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
        {label && (
          <span className="whitespace-nowrap rounded-full border border-[color:var(--color-neon)]/50 bg-[#0b0d13]/95 px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[color:var(--color-neon)] uppercase shadow-lg">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function EnterOtherWorld() {
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState<SceneId>(0);
  const [playing, setPlaying] = useState(true);
  const [stepTick, setStepTick] = useState(0);

  // Interactive states inside the 5 cartoon scenes so users can click & play too!
  const [walletBalance, setWalletBalance] = useState(25000);
  const [coinFlipping, setCoinFlipping] = useState(false);
  const [flipStreak, setFlipStreak] = useState(2);
  const [frogLane, setFrogLane] = useState(2); // 0..3
  const [arcadeScore, setArcadeScore] = useState(1450);
  const [potPct, setPotPct] = useState(84);
  const [potUnlocked, setPotUnlocked] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);

  const selectScene = useCallback((next: SceneId, keepPlaying = false) => {
    setScene(next);
    setStepTick(0);
    setPlaying(keepPlaying);
  }, []);

  // Sub-step ticker inside each scene (drives the animated cursor & cartoon sequence)
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setStepTick((prev) => {
        const next = (prev + 1) % 6;
        if (scene === 0) {
          if (next === 2) setWalletBalance(25000);
          if (next === 4) setWalletBalance(50000);
        } else if (scene === 1) {
          if (next === 1 || next === 4) {
            setCoinFlipping(true);
            window.setTimeout(() => {
              setCoinFlipping(false);
              setFlipStreak((s) => Math.min(9, s + 1));
            }, 600);
          }
        } else if (scene === 2) {
          setFrogLane(next % 4);
          setArcadeScore((s) => s + 120);
        } else if (scene === 3) {
          if (next === 0) {
            setPotPct(78);
            setPotUnlocked(false);
          } else if (next === 1) {
            setPotPct(92);
          } else if (next >= 2) {
            setPotPct(100);
            setPotUnlocked(true);
          }
        } else if (scene === 4) {
          setWithdrawn(next >= 2);
        }
        return next;
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, [open, scene]);

  // Auto-advance between scenes when playing is true
  useEffect(() => {
    if (!open || !playing) return;
    const id = window.setTimeout(() => {
      setScene((prev) => ((prev + 1) % 5) as SceneId);
      setStepTick(0);
    }, SCENE_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [open, playing, scene]);

  // Gently scroll the matching real homepage section into view behind the theater
  useEffect(() => {
    if (!open) return;
    const target = SCENES[scene]?.scrollTarget;
    if (!target) return;
    try {
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch {
      // ignore selector issues
    }
  }, [open, scene]);

  // Keyboard navigation (Escape to close, Left/Right arrows to switch scenes)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowRight") {
        setPlaying(false);
        setStepTick(0);
        setScene((s) => ((s + 1) % 5) as SceneId);
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setStepTick(0);
        setScene((s) => ((s + 4) % 5) as SceneId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // User interactive handlers inside the cartoon stage
  const handleManualSwap = useCallback(() => {
    setPlaying(false);
    setWalletBalance((b) => b + 25000);
  }, []);

  const handleManualFlip = useCallback(() => {
    setPlaying(false);
    if (coinFlipping) return;
    setCoinFlipping(true);
    window.setTimeout(() => {
      setCoinFlipping(false);
      setFlipStreak((s) => s + 1);
      setWalletBalance((b) => b + 960);
    }, 600);
  }, [coinFlipping]);

  const handleManualHop = useCallback(() => {
    setPlaying(false);
    setFrogLane((l) => (l + 1) % 4);
    setArcadeScore((s) => s + 250);
  }, []);

  const handleManualPumpPot = useCallback(() => {
    setPlaying(false);
    setPotPct((p) => {
      const next = Math.min(100, p + 12);
      if (next >= 100) setPotUnlocked(true);
      return next;
    });
  }, []);

  const handleManualWithdraw = useCallback(() => {
    setPlaying(false);
    setWithdrawn((w) => !w);
  }, []);

  const currentScene = SCENES[scene];

  const frogMood: "wave" | "excited" | "gamer" | "rich" | "cool" =
    scene === 0
      ? "wave"
      : scene === 1
        ? "excited"
        : scene === 2
          ? "gamer"
          : scene === 3
            ? "rich"
            : "cool";

  return (
    <>
      {/* Shining Homepage Launcher Banner — 100% opt-in, never forced */}
      <div className="mt-8">
        <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-neon)]/40 bg-gradient-to-r from-[#111520] via-[#151c24] to-[#121620] p-5 sm:p-6 shadow-[0_0_40px_-12px_rgba(74,222,128,0.28)] transition-all duration-300 hover:border-[color:var(--color-neon)]/75 hover:shadow-[0_0_52px_-8px_rgba(74,222,128,0.42)]">
          {/* Ambient animated sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/3 h-48 w-96 -translate-x-1/2 rounded-full bg-[color:var(--color-neon)]/10 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-96 rounded-full bg-[color:var(--color-gold)]/10 blur-3xl"
          />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Cartoon Frog Mascot Badge */}
              <button
                type="button"
                onClick={() => {
                  selectScene(0, true);
                  setOpen(true);
                }}
                aria-label="Enter the Other World interactive cartoon"
                className="relative shrink-0 rounded-2xl border border-[color:var(--color-neon)]/40 bg-[#0b0e15] p-2 shadow-inner transition-transform duration-300 group-hover:scale-105"
              >
                <CartoonFrogMascot mood="wave" className="h-16 w-16 sm:h-20 sm:w-20" />
                <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#0b0e15] bg-[color:var(--color-neon)] text-[11px] font-bold text-[#09090b] shadow">
                  ▶
                </span>
              </button>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-neon)]/45 bg-[color:var(--color-neon)]/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-[color:var(--color-neon)] uppercase">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-neon)]" />
                    Interactive Cartoon Story · 60 sec
                  </span>
                  <span className="hidden sm:inline-block font-mono text-[11px] text-[color:var(--color-text-dim)]">
                    Click, flip &amp; see how the house works
                  </span>
                </div>

                <h2 className="mt-1.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--color-bone)]">
                  New here?{" "}
                  <span className="bg-gradient-to-r from-[color:var(--color-neon)] via-[#bbf7d0] to-[color:var(--color-gold)] bg-clip-text text-transparent">
                    Enter the Other World
                  </span>
                </h2>

                <p className="mt-1 max-w-2xl text-xs sm:text-sm leading-relaxed text-[color:var(--color-text-muted)]">
                  Follow Ribbit the Bounty Hunter through a live, clickable cartoon tour of
                  provably-fair tables, free replay-verified arcade games, self-filling $OWP
                  bounties, and instant automatic payouts.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
              <button
                type="button"
                onClick={() => {
                  selectScene(0, true);
                  setOpen(true);
                }}
                className="btn btn-primary btn-lg group/btn relative overflow-hidden shadow-[0_0_25px_rgba(74,222,128,0.35)]"
              >
                <span className="mr-1.5 inline-block text-base transition-transform duration-200 group-hover/btn:translate-x-0.5">
                  ✦
                </span>
                Enter the Other World
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Cartoon Theater Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enter-other-world-title"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Stage Container */}
          <div
            ref={stageRef}
            className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[color:var(--color-neon)]/40 bg-[#0d1017] text-[color:var(--color-bone)] shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
          >
            {/* Top Theater Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--hairline)] bg-[#111520] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2.5">
                <img
                  src="/art/logo.png"
                  alt=""
                  className="h-6 w-6 rounded-full object-contain"
                />
                <span className="font-mono text-xs font-semibold tracking-wider text-[color:var(--color-neon)] uppercase">
                  Enter the Other World
                </span>
                <span className="hidden sm:inline-block font-mono text-[11px] text-[color:var(--color-text-dim)]">
                  · Interactive Cartoon Guide
                </span>
              </div>

              {/* Scene Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                {SCENES.map((s) => {
                  const active = s.id === scene;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectScene(s.id, false)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        active
                          ? "bg-[color:var(--color-neon)] font-bold text-[#09090b]"
                          : "bg-[#171c29] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-bone)]"
                      }`}
                    >
                      {s.code} <span className="hidden md:inline">{s.shortTitle}</span>
                    </button>
                  );
                })}
              </div>

              {/* Auto-Play & Close Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded-lg border border-[color:var(--border-solid)] bg-[#171c29] px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-bone)] hover:border-[color:var(--color-neon)]/50"
                  title={playing ? "Pause auto-play" : "Resume auto-play"}
                >
                  {playing ? "⏸ Auto" : "▶ Play"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close cartoon tour"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--border-solid)] bg-[#171c29] text-sm text-[color:var(--color-text-muted)] hover:border-[color:var(--color-neon)]/50 hover:text-[color:var(--color-bone)]"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Main Theater Content */}
            <div className="overflow-y-auto p-4 sm:p-6">
              {/* Cartoon Speech Bubble & Mascot Header */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center rounded-xl border border-[color:var(--border-solid)] bg-[#131824] p-4">
                <div className="flex items-center gap-3 sm:shrink-0">
                  <CartoonFrogMascot mood={frogMood} className="h-16 w-16 sm:h-20 sm:w-20" />
                  <div className="sm:hidden">
                    <div className="font-mono text-[10px] tracking-widest text-[color:var(--color-neon)] uppercase">
                      {currentScene.kicker}
                    </div>
                    <h3
                      id="enter-other-world-title"
                      className="font-display text-base font-bold text-[color:var(--color-bone)]"
                    >
                      {currentScene.title}
                    </h3>
                  </div>
                </div>

                <div className="flex-1">
                  <div className="hidden sm:block font-mono text-[10px] tracking-widest text-[color:var(--color-neon)] uppercase">
                    {currentScene.kicker}
                  </div>
                  <h3 className="hidden sm:block font-display text-lg font-bold text-[color:var(--color-bone)]">
                    {currentScene.title}
                  </h3>
                  <div className="mt-1.5 rounded-lg border border-[color:var(--color-neon)]/25 bg-[#0c1018] px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed text-[color:var(--color-bone)]">
                    <span className="mr-1.5 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-neon)] uppercase">
                      Ribbit:
                    </span>
                    “{currentScene.speech}”
                  </div>
                </div>
              </div>

              {/* INTERACTIVE CARTOON STAGE WINDOW (Mini Browser / Game Stage) */}
              <div className="relative mt-4 min-h-[260px] overflow-hidden rounded-xl border border-[color:var(--color-neon)]/30 bg-gradient-to-b from-[#0b0e16] to-[#111726] p-4 sm:p-6">
                {/* Mini Browser Chrome Header */}
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2.5 font-mono text-[11px] text-[color:var(--color-text-dim)]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                    <span className="ml-2 rounded bg-white/5 px-2 py-0.5 text-[10px] text-[color:var(--color-bone)]">
                      otherworldprojex.xyz
                      {scene === 0
                        ? "/#buy"
                        : scene === 1
                          ? "/games/flip"
                          : scene === 2
                            ? "/games/hopper"
                            : scene === 3
                              ? "/bounties"
                              : "/account"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[color:var(--color-gold)]">
                      Balance: {walletBalance.toLocaleString()} $OWP
                    </span>
                  </div>
                </div>

                {/* SCENE 0 STAGE: Connect Wallet & Swap SOL -> $OWP */}
                {scene === 0 && (
                  <div className="relative grid gap-4 sm:grid-cols-2 items-center py-2">
                    <AnimatedCursor
                      x={stepTick < 2 ? "22%" : "68%"}
                      y={stepTick < 2 ? "56%" : "62%"}
                      clicking={stepTick === 1 || stepTick === 3}
                      label={stepTick < 2 ? "1. Sign In (Free)" : "2. Swap SOL → $OWP"}
                    />

                    {/* Step 1 Card: Connect & Sign */}
                    <div className="rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
                          Step 1 · Vault Door
                        </span>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                          ✓ Connected
                        </span>
                      </div>
                      <div className="mt-2 font-display text-sm font-bold">
                        Wallet: 7xKp…9mQv
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Signed off-chain session message (0.00 SOL gas).
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-neon)]/40 bg-[color:var(--color-neon)]/10 px-3 py-1.5 font-mono text-xs text-[color:var(--color-neon)]">
                        <span>🔓</span> Vault Unlocked
                      </div>
                    </div>

                    {/* Step 2 Card: Instant SOL -> $OWP Vending Machine */}
                    <div className="rounded-xl border border-[color:var(--color-neon)]/40 bg-[#151b2b] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-neon)]">
                          Step 2 · Instant Treasury Swap
                        </span>
                        <span className="font-mono text-[10px] text-[color:var(--color-gold)]">
                          Live Raydium Spot
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 font-mono text-xs">
                        <span>1.00 SOL</span>
                        <span className="text-[color:var(--color-neon)]">→</span>
                        <span className="font-bold text-[color:var(--color-gold)]">
                          +25,000 $OWP
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleManualSwap}
                        className="mt-3 w-full rounded-lg bg-[color:var(--color-neon)] px-3 py-2 font-mono text-xs font-bold text-[#09090b] transition-transform active:scale-95"
                      >
                        ⚡ Click to Test Swap (+25,000 $OWP)
                      </button>
                    </div>
                  </div>
                )}

                {/* SCENE 1 STAGE: Provably-Fair Frog Flip */}
                {scene === 1 && (
                  <div className="relative grid gap-4 sm:grid-cols-2 items-center py-1">
                    <AnimatedCursor
                      x="70%"
                      y="66%"
                      clicking={stepTick === 1 || stepTick === 4}
                      label="Click to Flip!"
                    />

                    {/* 3D Coin Showcase */}
                    <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div
                        onClick={handleManualFlip}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && handleManualFlip()}
                        className="cursor-pointer select-none transition-transform hover:scale-105"
                        title="Click to flip the coin!"
                      >
                        <img
                          src="/art/owp_coin_frog.png"
                          alt="OWP Frog Coin"
                          className={`h-24 w-24 rounded-full object-contain drop-shadow-[0_8px_20px_rgba(234,179,8,0.4)] transition-transform duration-500 ${
                            coinFlipping ? "rotate-[720deg] scale-110" : ""
                          }`}
                        />
                      </div>
                      <div className="mt-2 font-mono text-xs font-bold text-[color:var(--color-gold)]">
                        {coinFlipping
                          ? "Spinning in the air…"
                          : `WIN! +960 $OWP (1.92× · Streak ×${flipStreak})`}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-emerald-400">
                        ✓ SHA-256 Seed Hash: 9f8a…4c21 (Verified Fair)
                      </div>
                    </div>

                    {/* Interactive Controls */}
                    <div className="rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-neon)]">
                        Try it right here
                      </div>
                      <div className="mt-1 font-display text-base font-bold">
                        Frog Flip · Pond Dice · Blackjack
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Every hand locks a cryptographic server seed before you bet and
                        reveals it right after so you can verify the math.
                      </p>
                      <button
                        type="button"
                        onClick={handleManualFlip}
                        className="mt-3 w-full rounded-lg bg-[color:var(--color-neon)] px-3 py-2 font-mono text-xs font-bold text-[#09090b] transition-transform active:scale-95"
                      >
                        🪙 Flip the Frog Coin (Win +960 $OWP)
                      </button>
                    </div>
                  </div>
                )}

                {/* SCENE 2 STAGE: Free Skill Arcade (Hopper / Frogris / Worm Frog) */}
                {scene === 2 && (
                  <div className="relative grid gap-4 sm:grid-cols-2 items-center py-1">
                    <AnimatedCursor
                      x="72%"
                      y="68%"
                      clicking={stepTick % 2 === 1}
                      label="60 Hz Replay Verified"
                    />

                    {/* Mini Interactive Hopper Lanes */}
                    <div className="rounded-xl border border-white/10 bg-[#0d1320] p-3">
                      <div className="mb-2 flex items-center justify-between font-mono text-[10px]">
                        <span className="text-emerald-400">FREE ARCADE · HOPPER</span>
                        <span className="font-bold text-[color:var(--color-gold)]">
                          SCORE: {arcadeScore}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {[3, 2, 1, 0].map((lane) => (
                          <div
                            key={lane}
                            className={`relative flex h-8 items-center justify-between rounded px-3 font-mono text-[10px] ${
                              lane === 3
                                ? "bg-emerald-950/60 border border-emerald-500/30"
                                : lane % 2 === 1
                                  ? "bg-slate-900/90"
                                  : "bg-sky-950/50"
                            }`}
                          >
                            <span className="text-white/40">
                              {lane === 3
                                ? "🏁 SAFE LILY PAD (+250)"
                                : lane === 2
                                  ? "🪵 Floating Log →"
                                  : lane === 1
                                    ? "🏎️ Turbo Sedan ←"
                                    : "🌱 Starting Bank"}
                            </span>
                            {frogLane === lane && (
                              <img
                                src="/art/owp_hopper_frog.png"
                                alt="Hopper Frog"
                                className="h-6 w-6 object-contain transition-all duration-200"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Interactive Hop Control */}
                    <div className="rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-neon)]">
                        Zero Wager Required
                      </div>
                      <div className="mt-1 font-display text-base font-bold">
                        Hopper, Frogris &amp; Worm Frog
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Play for free anytime. Our server replays your exact input stream at
                        60 Hz to block bots and pay real players on the weekly bounty board.
                      </p>
                      <button
                        type="button"
                        onClick={handleManualHop}
                        className="mt-3 w-full rounded-lg bg-[color:var(--color-neon)] px-3 py-2 font-mono text-xs font-bold text-[#09090b] transition-transform active:scale-95"
                      >
                        🐸 Click to Hop Ribbit Across (+250 PTS)
                      </button>
                    </div>
                  </div>
                )}

                {/* SCENE 3 STAGE: Self-Filling Bounties & Live Auctions */}
                {scene === 3 && (
                  <div className="relative grid gap-4 sm:grid-cols-2 items-center py-1">
                    <AnimatedCursor
                      x="70%"
                      y="68%"
                      clicking={stepTick === 1 || stepTick === 2}
                      label="Half of house edge → Pot!"
                    />

                    {/* Bounty Cauldron Meter */}
                    <div className="rounded-xl border border-[color:var(--color-gold)]/40 bg-[#151b2b] p-4">
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="text-[color:var(--color-gold)] uppercase">
                          🏆 Live Game Bounty Pool
                        </span>
                        <span className="font-bold text-[color:var(--color-neon)]">
                          {potPct}% Unlocked
                        </span>
                      </div>

                      <div className="mt-2 font-display text-lg font-bold text-[color:var(--color-bone)]">
                        100,000 $OWP Prize Pool
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/50 p-0.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[color:var(--color-neon)] to-[color:var(--color-gold)] transition-all duration-500"
                          style={{ width: `${potPct}%` }}
                        />
                      </div>

                      <div className="mt-2.5 rounded-lg bg-black/35 px-3 py-2 font-mono text-[11px]">
                        {potUnlocked ? (
                          <span className="font-bold text-[color:var(--color-gold)]">
                            🎉 POT UNLOCKED! Auto-paying top hunters pro-rata!
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-text-muted)]">
                            Every table wager sends 50% of the house edge here…
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pump Pot + Auction Callout */}
                    <div className="rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-neon)]">
                        Automatic Treasury Loop
                      </div>
                      <div className="mt-1 font-display text-base font-bold">
                        Self-Filling Bounties &amp; $OWP Auctions
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Half the house edge fuels game bounties that pay out automatically.
                        Or take your $OWP to the Auction House to bid on 1/1 collectibles!
                      </p>
                      <button
                        type="button"
                        onClick={handleManualPumpPot}
                        className="mt-3 w-full rounded-lg bg-[color:var(--color-gold)] px-3 py-2 font-mono text-xs font-bold text-[#09090b] transition-transform active:scale-95"
                      >
                        ⚡ Pump Bounty Pot to 100% Unlock
                      </button>
                    </div>
                  </div>
                )}

                {/* SCENE 4 STAGE: Instant Automatic Withdrawals & Launchpad */}
                {scene === 4 && (
                  <div className="relative grid gap-4 sm:grid-cols-2 items-center py-1">
                    <AnimatedCursor
                      x="26%"
                      y="68%"
                      clicking={stepTick === 2}
                      label="Instant On-Chain Payout"
                    />

                    {/* Auto-Withdraw Demo Card */}
                    <div className="rounded-xl border border-[color:var(--color-neon)]/40 bg-[#151b2b] p-4">
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="text-[color:var(--color-neon)] uppercase">
                          Self-Custody Treasury
                        </span>
                        <span className="text-emerald-400">Solana Mainnet</span>
                      </div>
                      <div className="mt-2 font-display text-base font-bold">
                        {withdrawn
                          ? "✅ Sent 25,960 $OWP to 7xKp…9mQv"
                          : "Ready to Cash Out Anytime"}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        {withdrawn
                          ? "Tx confirmed on-chain in 1.2s — signed automatically by the house wallet."
                          : "No withdrawal queues or manual approvals. The same treasury wallet pays you automatically."}
                      </p>
                      <button
                        type="button"
                        onClick={handleManualWithdraw}
                        className="mt-3 w-full rounded-lg border border-[color:var(--color-neon)]/50 bg-[color:var(--color-neon)]/15 px-3 py-2 font-mono text-xs font-bold text-[color:var(--color-neon)] transition-transform active:scale-95"
                      >
                        {withdrawn ? "↺ Reset Demo Withdrawal" : "💸 Test Instant Withdrawal"}
                      </button>
                    </div>

                    {/* Direct Launch Links into the Real Site */}
                    <div className="rounded-xl border border-white/10 bg-[#151b2b] p-4">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-gold)]">
                        Jump Right In
                      </div>
                      <div className="mt-1 font-display text-base font-bold">
                        Where do you want to start?
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <a
                          href="#buy"
                          onClick={() => setOpen(false)}
                          className="rounded-lg bg-[color:var(--color-neon)] px-3 py-2 text-center font-mono text-xs font-bold text-[#09090b] hover:opacity-90"
                        >
                          Buy $OWP
                        </a>
                        <Link
                          href="/games/flip"
                          onClick={() => setOpen(false)}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-xs font-semibold text-[color:var(--color-bone)] hover:border-[color:var(--color-neon)]/50"
                        >
                          Play Frog Flip
                        </Link>
                        <Link
                          href="/games/hopper"
                          onClick={() => setOpen(false)}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-xs font-semibold text-[color:var(--color-bone)] hover:border-[color:var(--color-neon)]/50"
                        >
                          Free Hopper
                        </Link>
                        <Link
                          href="/bounties"
                          onClick={() => setOpen(false)}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-xs font-semibold text-[color:var(--color-bone)] hover:border-[color:var(--color-neon)]/50"
                        >
                          Bounty Board
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scene Caption & 3 Fact Pills */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {currentScene.highlights.map((h) => (
                  <div
                    key={h.label}
                    className="rounded-xl border border-[color:var(--hairline)] bg-[#121622] px-3.5 py-2.5"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-dim)]">
                      {h.label}
                    </div>
                    <div className="mt-0.5 font-display text-sm font-bold text-[color:var(--color-bone)]">
                      {h.value}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
                {currentScene.caption}
              </p>
            </div>

            {/* Bottom Navigation Footer */}
            <div className="flex items-center justify-between border-t border-[color:var(--hairline)] bg-[#111520] px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => selectScene(((scene + 4) % 5) as SceneId, false)}
                className="rounded-lg border border-[color:var(--border-solid)] bg-[#171c29] px-3 py-1.5 font-mono text-xs text-[color:var(--color-bone)] hover:border-[color:var(--color-neon)]/50"
              >
                ← Prev
              </button>

              <div className="flex items-center gap-1.5">
                {SCENES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Go to scene ${s.code}`}
                    onClick={() => selectScene(s.id, false)}
                    className={`h-2 rounded-full transition-all ${
                      s.id === scene
                        ? "w-6 bg-[color:var(--color-neon)]"
                        : "w-2 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>

              {scene < 4 ? (
                <button
                  type="button"
                  onClick={() => selectScene(((scene + 1) % 5) as SceneId, false)}
                  className="rounded-lg bg-[color:var(--color-neon)] px-3.5 py-1.5 font-mono text-xs font-bold text-[#09090b] hover:opacity-90"
                >
                  Next Act →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-[color:var(--color-neon)] px-3.5 py-1.5 font-mono text-xs font-bold text-[#09090b] hover:opacity-90"
                >
                  Start Playing ✦
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
