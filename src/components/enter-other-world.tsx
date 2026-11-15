"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type TourStepIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface TourStop {
  id: TourStepIndex;
  code: string;
  chipLabel: string;
  kicker: string;
  title: string;
  summary: string;
  route: string;
  targetSelector: string;
  targetTag: string;
  art: string;
  metrics: { label: string; value: string }[];
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 0,
    code: "01",
    chipLabel: "Treasury Desk",
    kicker: "Stop 01 / 06 · Instant $OWP Desk",
    title: "Gasless wallet sign-in & live Raydium treasury swaps",
    summary:
      "Connect with a free message signature — no email or password. Pay SOL on the homepage desk and the house wallet sends $OWP at the live Raydium spot price, or deposit $OWP 1:1 into your balance.",
    route: "/",
    targetSelector: "#buy .panel",
    targetTag: "LIVE TARGET · TREASURY SWAP DESK",
    art: "/art/hero-flagship.jpg",
    metrics: [
      { label: "Auth", value: "0 SOL message sig" },
      { label: "Pricing", value: "Live Raydium spot" },
      { label: "Deposits", value: "1 : 1 $OWP credit" },
    ],
  },
  {
    id: 1,
    code: "02",
    chipLabel: "Frog Flip",
    kicker: "Stop 02 / 06 · Wing I — Table 01",
    title: "Frog Flip — 1.92× payouts & SHA-256 commit-reveal",
    summary:
      "Watch the co-pilot switch to the live practice table, call a side, and flip the 3D coin. Every round locks a SHA-256 server seed hash upfront at a published 4% house edge.",
    route: "/games/flip",
    targetSelector: ".game-stage",
    targetTag: "LIVE DEMO · FROG FLIP TABLE",
    art: "/art/owp_pump.png",
    metrics: [
      { label: "Win multiplier", value: "1.92× even odds" },
      { label: "House edge", value: "Published 4%" },
      { label: "Verification", value: "SHA-256 seed hash" },
    ],
  },
  {
    id: 2,
    code: "03",
    chipLabel: "Pond Dice",
    kicker: "Stop 03 / 06 · Wing I — Table 02",
    title: "Pond Dice — dial your own risk line & roll live",
    summary:
      "Watch the co-pilot sweep the win-zone line across the track and trigger live rolls. Lower targets multiply payouts up to 96× under the same cryptographic fairness protocol.",
    route: "/games/dice",
    targetSelector: ".game-stage",
    targetTag: "LIVE DEMO · POND DICE TRACK",
    art: "/art/art-dice.jpg",
    metrics: [
      { label: "Win zone", value: "2% – 94% custom" },
      { label: "Max multiplier", value: "Up to 96.00×" },
      { label: "Bounty feed", value: "50% of house edge" },
    ],
  },
  {
    id: 3,
    code: "04",
    chipLabel: "Free Hopper",
    kicker: "Stop 04 / 06 · Wing I — Free Skill Arcade",
    title: "Hopper — free-to-play with 60 Hz deterministic server replay",
    summary:
      "Watch the co-pilot start a live Hopper run and hop across traffic. Every arcade run (Hopper, Frogris, Worm Frog) is free to play and re-simulated at 60 Hz on the server so bots can never fake a score.",
    route: "/games/hopper",
    targetSelector: ".game-stage",
    targetTag: "LIVE DEMO · 60 HZ HOPPER CANVAS",
    art: "/art/owp_frogger.png",
    metrics: [
      { label: "Entry cost", value: "Free to play" },
      { label: "Anti-cheat", value: "60 Hz server replay" },
      { label: "Prizes", value: "Weekly $OWP pools" },
    ],
  },
  {
    id: 4,
    code: "05",
    chipLabel: "Bounty Board",
    kicker: "Stop 05 / 06 · Wing III — The Bounty Board",
    title: "Self-filling $OWP pools that pay out automatically",
    summary:
      "Half of the house edge from every table bet feeds that game's live bounty pool. When the activity meter reaches 100%, the treasury credits every eligible hunter pro-rata, automatically.",
    route: "/bounties",
    targetSelector: "main",
    targetTag: "LIVE TARGET · ACTIVE BOUNTY POOLS",
    art: "/art/art-bounty.jpg",
    metrics: [
      { label: "Pool funding", value: "50% of table edge" },
      { label: "Settlement", value: "Automatic pro-rata" },
      { label: "Arcade boards", value: "7-day verified runs" },
    ],
  },
  {
    id: 5,
    code: "06",
    chipLabel: "Auction House",
    kicker: "Stop 06 / 06 · Wing II & Self-Custody Vault",
    title: "Escrowed $OWP auctions & instant automatic withdrawals",
    summary:
      "Bid on 1/1 lots and community consignments with automatic outbid refunds and 2-minute anti-snipe protection. Ready to cash out? Withdraw anytime and the same treasury wallet pays you on-chain.",
    route: "/auctions",
    targetSelector: "main",
    targetTag: "LIVE TARGET · THE AUCTION HOUSE",
    art: "/art/hero-auction.jpg",
    metrics: [
      { label: "Bidding", value: "Escrowed $OWP" },
      { label: "Outbid refund", value: "Instant credit" },
      { label: "Withdrawals", value: "Auto on-chain" },
    ],
  },
];

const STOP_DURATION_MS = 11000;

export function launchOtherWorldTour(step: TourStepIndex = 0) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("owp:enter-other-world", { detail: { step } })
  );
}

/**
 * Homepage Showcase Strip ("Enter the Other World")
 * Built 100% with native House classes (.panel, .panel-glow, .coin-face, .kicker, .chips, .chip, .btn-primary).
 */
export function EnterOtherWorld() {
  const [coinAngle, setCoinAngle] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCoinAngle((a) => a + 180);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="mt-8" aria-label="Enter the Other World interactive walkthrough">
      <div
        className="panel panel-glow panel-etched p-5 sm:p-7 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, oklch(0.78 0.11 150 / 0.09), transparent 55%), radial-gradient(100% 120% at 100% 100%, oklch(0.8 0.1 85 / 0.08), transparent 55%), var(--color-surface)",
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            {/* Real 3D House Coin Emblem */}
            <button
              type="button"
              onClick={() => launchOtherWorldTour(0)}
              aria-label="Launch Enter the Other World live walkthrough"
              className="shrink-0 group relative cursor-pointer"
              style={{ width: 68, height: 68, perspective: "500px" }}
            >
              <div
                className="w-full h-full relative"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: `rotateY(${coinAngle}deg)`,
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
                  <span className="live-dot" /> Autonomous Live Walkthrough
                </span>
                <span className="kicker !text-[0.62rem]">
                  6 live stops · Real clicks &amp; plays
                </span>
              </div>

              <h2 className="text-[1.35rem] sm:text-[1.6rem] tracking-tight">
                Enter the{" "}
                <span className="text-neon">Other World</span>
              </h2>

              <p className="text-fog text-[0.875rem] leading-relaxed max-w-2xl mt-1">
                Watch the house co-pilot drive the live site in real time — pricing
                SOL → $OWP on the treasury desk, flipping the 3D coin on Frog Flip,
                rolling Pond Dice, hopping live traffic in Hopper, and inspecting
                active bounty pools.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
            <button
              type="button"
              onClick={() => launchOtherWorldTour(0)}
              className="btn btn-primary btn-lg"
            >
              Enter the Other World →
            </button>
            <span
              className="mono text-[0.68rem] text-center lg:text-right"
              style={{ color: "var(--text-dim)" }}
            >
              Or jump directly to a live stop below
            </span>
          </div>
        </div>

        {/* Direct Stop Jump Chips */}
        <div
          className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="chips">
            {TOUR_STOPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => launchOtherWorldTour(s.id)}
                className="chip"
              >
                <span className="mono text-neon mr-1.5">{s.code}</span>
                {s.chipLabel}
              </button>
            ))}
          </div>

          <span className="mono text-[0.68rem] hidden xl:inline" style={{ color: "var(--text-dim)" }}>
            100% sandboxed demo · Never touches your wallet balance
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Helper to find a visible button containing specific text inside a root selector.
 */
function findButtonByText(
  rootSelector: string,
  textMatch: string | RegExp
): HTMLButtonElement | null {
  if (typeof document === "undefined") return null;
  const root = document.querySelector(rootSelector) ?? document.body;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of buttons) {
    const label = (btn.textContent ?? "").trim();
    const matched =
      typeof textMatch === "string"
        ? label.toLowerCase().includes(textMatch.toLowerCase())
        : textMatch.test(label);
    if (matched && btn.offsetParent !== null) {
      return btn;
    }
  }
  return null;
}

/**
 * Ensure Sandbox mode is active on table games so the autonomous tour can always play
 * rounds without requiring a wallet or touching a signed-in user's real $OWP.
 */
function ensureSandboxMode() {
  const sandboxChip = findButtonByText(".game-stage", "Sandbox");
  if (sandboxChip && sandboxChip.getAttribute("aria-pressed") !== "true") {
    try {
      sandboxChip.click();
    } catch {
      // ignore
    }
  }
}

/**
 * Scroll element smoothly into the upper-middle viewport so the bottom Director Dock
 * never overlaps the interactive area.
 */
function scrollElementAboveDock(el: Element) {
  if (typeof window === "undefined") return;
  const rect = el.getBoundingClientRect();
  const viewportAvailHeight = Math.max(260, window.innerHeight - 230);
  if (rect.top < 76 || rect.bottom > viewportAvailHeight) {
    const targetY =
      window.scrollY +
      rect.top -
      Math.max(
        84,
        (viewportAvailHeight - Math.min(rect.height, viewportAvailHeight * 0.75)) / 2
      );
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }
}

/**
 * Persistent Autonomous Live Tour Director (mounted in RootLayout).
 * Drives the real Next.js router, spotlights live DOM targets, moves a hardware-style
 * co-pilot cursor to real controls, and executes real clicks/plays in Sandbox mode.
 */
export function OtherWorldDirector() {
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [step, setStep] = useState<TourStepIndex>(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [progress, setProgress] = useState(0);
  const [actionText, setActionText] = useState("Initializing live walkthrough…");

  // Cursor state in viewport coordinates
  const [cursor, setCursor] = useState<{
    x: number;
    y: number;
    label: string;
    clicking: boolean;
    visible: boolean;
  }>({
    x: 480,
    y: 320,
    label: "CO-PILOT",
    clicking: false,
    visible: false,
  });

  // Spotlight bounding box in viewport coordinates
  const [spotRect, setSpotRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
  });

  const timersRef = useRef<number[]>([]);
  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(fn, delayMs);
    timersRef.current.push(id);
    return id;
  }, []);

  // Listen for global launch event
  useEffect(() => {
    const onLaunch = (e: Event) => {
      const detail = (e as CustomEvent<{ step?: TourStepIndex }>).detail;
      const startStep = detail?.step ?? 0;
      clearAllTimers();
      setStep(startStep);
      setAutoPlay(true);
      setProgress(0);
      setActive(true);
      setCursor({
        x: Math.round(window.innerWidth * 0.5),
        y: Math.round(window.innerHeight * 0.38),
        label: "CO-PILOT READY",
        clicking: false,
        visible: true,
      });
    };
    window.addEventListener("owp:enter-other-world", onLaunch);
    return () => window.removeEventListener("owp:enter-other-world", onLaunch);
  }, [clearAllTimers]);

  const closeTour = useCallback(() => {
    clearAllTimers();
    setActive(false);
    setSpotRect((r) => ({ ...r, visible: false }));
    setCursor((c) => ({ ...c, visible: false }));
  }, [clearAllTimers]);

  const goToStep = useCallback(
    (nextStep: TourStepIndex, keepAuto = false) => {
      clearAllTimers();
      setStep(nextStep);
      setProgress(0);
      setAutoPlay(keepAuto);
    },
    [clearAllTimers]
  );

  // Keyboard shortcuts (Escape to exit)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, closeTour]);

  // Continuous progress bar + auto-advance timer (starts once pathname matches the stop's route)
  useEffect(() => {
    if (!active || !autoPlay) return;
    const currentStop = TOUR_STOPS[step];
    if (pathname !== currentStop.route) return;

    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / STOP_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed >= STOP_DURATION_MS) {
        window.clearInterval(interval);
        setStep((prev) => ((prev + 1) % TOUR_STOPS.length) as TourStepIndex);
        setProgress(0);
      }
    }, 80);
    return () => window.clearInterval(interval);
  }, [active, autoPlay, step, pathname]);

  // Track the spotlighted DOM element at 60fps so scrolling/resizing keeps the frame locked on target
  useEffect(() => {
    if (!active) return;
    let rafId = 0;
    const stopMeta = TOUR_STOPS[step];

    const updateRect = () => {
      if (pathname === stopMeta.route) {
        const el = document.querySelector(stopMeta.targetSelector);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 20 && r.height > 20) {
            setSpotRect({
              left: Math.max(8, r.left - 8),
              top: Math.max(68, r.top - 8),
              width: Math.min(window.innerWidth - 16, r.width + 16),
              height: Math.min(r.height + 16, window.innerHeight - 100),
              visible: true,
            });
          }
        } else {
          setSpotRect((prev) => ({ ...prev, visible: false }));
        }
      } else {
        setSpotRect((prev) => ({ ...prev, visible: false }));
      }
      rafId = window.requestAnimationFrame(updateRect);
    };

    rafId = window.requestAnimationFrame(updateRect);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, step, pathname]);

  // Helper to move cursor to a live DOM element getter and optionally click it
  const moveAndClickElement = useCallback(
    (
      getEl: () => HTMLElement | null,
      cursorLabel: string,
      statusMessage: string,
      doClick = true
    ) => {
      setActionText(statusMessage);
      const el = getEl();
      if (!el) return;
      scrollElementAboveDock(el);
      const r = el.getBoundingClientRect();
      setCursor({
        x: Math.round(r.left + r.width * 0.5),
        y: Math.round(r.top + r.height * 0.5),
        label: cursorLabel,
        clicking: false,
        visible: true,
      });

      if (doClick) {
        schedule(() => {
          const freshEl = getEl() ?? el;
          const fresh = freshEl.getBoundingClientRect();
          setCursor({
            x: Math.round(fresh.left + fresh.width * 0.5),
            y: Math.round(fresh.top + fresh.height * 0.5),
            label: cursorLabel,
            clicking: true,
            visible: true,
          });
          try {
            freshEl.click();
          } catch {
            // ignore
          }
          schedule(() => {
            setCursor((c) => ({ ...c, clicking: false }));
          }, 360);
        }, 520);
      }
    },
    [schedule]
  );

  // Choreograph the real website interactions for each stop!
  useEffect(() => {
    if (!active) return;
    clearAllTimers();

    const currentStop = TOUR_STOPS[step];

    // 1. Navigate to the stop's route if not already there
    if (pathname !== currentStop.route) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActionText(`Opening ${currentStop.chipLabel} (${currentStop.route})…`);
      router.push(currentStop.route);
      return;
    }

    // 2. Poll until the target container is mounted in the DOM, then start the stop choreography
    let attempts = 0;
    const waitReady = () => {
      const targetEl = document.querySelector(currentStop.targetSelector) as HTMLElement | null;
      if (!targetEl && attempts < 25) {
        attempts += 1;
        schedule(waitReady, 120);
        return;
      }

      if (step === 0) {
        // STOP 01: Homepage #buy Treasury Desk
        if (targetEl) scrollElementAboveDock(targetEl);
        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("#buy", "0.1 SOL"),
            "CLICK · 0.1 SOL",
            "Quoting 0.1 SOL on the live Raydium treasury desk…"
          );
        }, 450);

        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("#buy", "0.5 SOL"),
            "CLICK · 0.5 SOL",
            "Quoting 0.5 SOL → instant $OWP payout from the house wallet…"
          );
        }, 3400);

        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("#buy", "1 SOL"),
            "CLICK · 1 SOL",
            "Quoting 1.0 SOL → live on-chain rate locked on confirmation…"
          );
        }, 6500);
      } else if (step === 1) {
        // STOP 02: Frog Flip (/games/flip)
        if (targetEl) scrollElementAboveDock(targetEl);
        ensureSandboxMode();

        schedule(() => {
          ensureSandboxMode();
          moveAndClickElement(
            () => findButtonByText(".game-stage", "Frog"),
            "CALL · 🐸 FROG",
            "Selecting 🐸 Frog on the provably-fair table…"
          );
        }, 450);

        schedule(() => {
          ensureSandboxMode();
          moveAndClickElement(
            () =>
              findButtonByText(
                ".game-stage",
                /Flip \(practice\)|Flip it|Double or nothing/i
              ),
            "CLICK · FLIP 3D COIN",
            "Flipping the 3D coin (1.92× payout, SHA-256 seed committed)…"
          );
        }, 2100);

        schedule(() => {
          ensureSandboxMode();
          const flyBtn = findButtonByText(".game-stage", "Fly");
          if (flyBtn && !flyBtn.disabled) {
            moveAndClickElement(
              () => findButtonByText(".game-stage", "Fly"),
              "CALL · 🪰 FLY",
              "Switching call to 🪰 Fly for the next hand…"
            );
          }
        }, 5500);

        schedule(() => {
          ensureSandboxMode();
          moveAndClickElement(
            () =>
              findButtonByText(
                ".game-stage",
                /Double or nothing|Flip \(practice\)|Flip it/i
              ),
            "CLICK · RIDE STREAK",
            "Flipping again — ride the streak ladder or cash out anytime!"
          );
        }, 7000);
      } else if (step === 2) {
        // STOP 03: Pond Dice (/games/dice)
        if (targetEl) scrollElementAboveDock(targetEl);
        ensureSandboxMode();

        schedule(() => {
          ensureSandboxMode();
          window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: 68 }));
          moveAndClickElement(
            () =>
              document.querySelector(
                '.game-stage input[type="range"]'
              ) as HTMLElement | null,
            "DIAL · WIN ZONE < 68",
            "Dialing Pond Dice win zone to 68% (1.41× payout)…",
            false
          );
        }, 450);

        schedule(() => {
          ensureSandboxMode();
          moveAndClickElement(
            () => findButtonByText(".game-stage", /Roll \(practice\)|Roll/i),
            "CLICK · ROLL DICE",
            "Rolling Pond Dice across the laser track…"
          );
        }, 2200);

        schedule(() => {
          ensureSandboxMode();
          window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: 32 }));
          moveAndClickElement(
            () =>
              document.querySelector(
                '.game-stage input[type="range"]'
              ) as HTMLElement | null,
            "DIAL · WIN ZONE < 32 (3.0×)",
            "Tightening the line to < 32 for a 3.00× multiplier…",
            false
          );
        }, 5200);

        schedule(() => {
          ensureSandboxMode();
          moveAndClickElement(
            () => findButtonByText(".game-stage", /Roll \(practice\)|Roll/i),
            "CLICK · HIGH-MULT ROLL",
            "Rolling for 3.00× — every roll feeds 50% of the edge to the bounty pot!"
          );
        }, 6800);
      } else if (step === 3) {
        // STOP 04: Hopper (/games/hopper)
        if (targetEl) scrollElementAboveDock(targetEl);

        schedule(() => {
          const startBtn = findButtonByText(
            ".game-stage",
            /Start hopping|Hop again/i
          );
          if (startBtn) {
            moveAndClickElement(
              () => findButtonByText(".game-stage", /Start hopping|Hop again/i),
              "CLICK · START HOPPING",
              "Starting a live 60 Hz deterministic Hopper run…"
            );
          } else {
            moveAndClickElement(
              () => document.querySelector(".game-stage canvas") as HTMLElement | null,
              "LIVE · 60 HZ CANVAS",
              "Hopper running live on the 60 Hz deterministic canvas…",
              false
            );
          }
        }, 450);

        const hops: { delay: number; key: string; label: string }[] = [
          { delay: 1800, key: "ArrowUp", label: "HOP · ↑ FORWARD" },
          { delay: 2650, key: "ArrowUp", label: "HOP · ↑ DODGE LANE" },
          { delay: 3500, key: "ArrowRight", label: "HOP · → SIDESTEP" },
          { delay: 4350, key: "ArrowUp", label: "HOP · ↑ CROSS ROAD" },
          { delay: 5200, key: "ArrowLeft", label: "HOP · ← ALIGN LOG" },
          { delay: 6050, key: "ArrowUp", label: "HOP · ↑ RIVER LOG" },
          { delay: 6900, key: "ArrowUp", label: "HOP · ↑ CLIMB WAVE" },
          { delay: 7750, key: "ArrowUp", label: "HOP · ↑ GOAL BANK" },
        ];

        for (const h of hops) {
          schedule(() => {
            const canvas = document.querySelector(
              ".game-stage canvas"
            ) as HTMLElement | null;
            if (canvas) {
              const r = canvas.getBoundingClientRect();
              setCursor({
                x: Math.round(r.left + r.width * 0.5),
                y: Math.round(r.top + r.height * 0.55),
                label: h.label,
                clicking: true,
                visible: true,
              });
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: h.key, bubbles: true })
              );
              setActionText(
                `Live 60 Hz input (${h.label}) — server replays the exact frame trace to verify scores.`
              );
              schedule(() => {
                setCursor((c) => ({ ...c, clicking: false }));
              }, 240);
            }
          }, h.delay);
        }
      } else if (step === 4) {
        // STOP 05: Bounty Board (/bounties)
        schedule(() => {
          window.scrollTo({ top: 180, behavior: "smooth" });
          moveAndClickElement(
            () => findButtonByText("main", "Frogris"),
            "CLICK · FROGRIS BOARD",
            "Inspecting live $OWP bounty pools & switching weekly arcade standings…"
          );
        }, 600);

        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("main", "Worm Frog"),
            "CLICK · WORM FROG BOARD",
            "Checking Worm Frog 7-day replay-verified leaderboard…"
          );
        }, 4000);

        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("main", "Hopper"),
            "CLICK · HOPPER BOARD",
            "When any bounty's unlock meter reaches 100%, winners are paid automatically."
          );
        }, 7200);
      } else if (step === 5) {
        // STOP 06: Auction House (/auctions)
        schedule(() => {
          window.scrollTo({ top: 160, behavior: "smooth" });
          moveAndClickElement(
            () => findButtonByText("main", "Ending soon"),
            "FILTER · ENDING SOON",
            "Browsing Auction House lots — escrowed $OWP bids & anti-snipe protection…"
          );
        }, 600);

        schedule(() => {
          moveAndClickElement(
            () => findButtonByText("main", "Live ·"),
            "FILTER · LIVE LOTS",
            "Outbid players are refunded to their in-app balance immediately."
          );
        }, 4000);

        schedule(() => {
          moveAndClickElement(
            () => document.querySelector("main aside.panel") as HTMLElement | null,
            "VAULT · AUTO WITHDRAW",
            "Your $OWP balance is always yours — withdraw anytime for automatic on-chain payout.",
            false
          );
        }, 7200);
      }
    };

    waitReady();

    return () => clearAllTimers();
  }, [active, step, pathname, router, clearAllTimers, schedule, moveAndClickElement]);

  if (!active) return null;

  const currentStop = TOUR_STOPS[step];

  return (
    <>
      {/* 1. Precision Spotlight Reticle around the real DOM target (pointer-events-none so user can still interact) */}
      {spotRect.visible && (
        <div
          aria-hidden="true"
          className="fixed z-40 pointer-events-none transition-all duration-300 ease-out rounded-xl"
          style={{
            left: spotRect.left,
            top: spotRect.top,
            width: spotRect.width,
            height: spotRect.height,
            border: "1.5px solid oklch(0.78 0.11 150 / 0.78)",
            boxShadow:
              "0 0 0 9999px oklch(0.06 0.008 270 / 0.48), 0 0 38px oklch(0.78 0.11 150 / 0.25), inset 0 0 24px oklch(0.78 0.11 150 / 0.08)",
          }}
        >
          {/* Top-left telemetry tag */}
          <div
            className="absolute -top-3 left-3 px-2 py-0.5 rounded mono text-[0.6rem] uppercase tracking-wider"
            style={{
              background: "oklch(0.13 0.009 270 / 0.96)",
              border: "1px solid oklch(0.78 0.11 150 / 0.55)",
              color: "var(--color-neon)",
            }}
          >
            ● {currentStop.targetTag}
          </div>
        </div>
      )}

      {/* 2. Autonomous Co-Pilot Hardware Cursor */}
      {cursor.visible && (
        <div
          aria-hidden="true"
          className="fixed z-50 pointer-events-none"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
            transition: "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* Expanding click ring on real DOM click */}
          {cursor.clicking && (
            <span
              className="absolute -left-5 -top-5 w-10 h-10 rounded-full animate-ping"
              style={{
                border: "2px solid var(--color-neon)",
                background: "oklch(0.78 0.11 150 / 0.25)",
              }}
            />
          )}

          <div
            className="relative flex items-center gap-2"
            style={{
              transform: cursor.clicking ? "scale(0.88)" : "scale(1)",
              transition: "transform 160ms ease",
            }}
          >
            {/* Sleek precision pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                filter: "drop-shadow(0 4px 12px oklch(0 0 0 / 0.85))",
              }}
            >
              <path
                d="M3.5 2.5L20 10.5L12.5 13L9.5 20.5L3.5 2.5Z"
                fill="oklch(0.82 0.12 150)"
                stroke="oklch(0.12 0.008 270)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>

            {/* Telemetry label chip attached to cursor */}
            <span
              className="mono text-[0.62rem] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{
                background: "oklch(0.12 0.009 270 / 0.95)",
                border: "1px solid oklch(0.78 0.11 150 / 0.6)",
                color: "var(--color-neon)",
                boxShadow: "0 8px 24px oklch(0 0 0 / 0.7)",
              }}
            >
              {cursor.label}
            </span>
          </div>
        </div>
      )}

      {/* 3. Editorial House Director Dock (Bottom HUD) */}
      <aside
        role="region"
        aria-label="Enter the Other World live walkthrough controls"
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-1.25rem)] max-w-4xl"
      >
        <div
          className="panel panel-glow overflow-hidden"
          style={{
            background: "oklch(0.13 0.009 270 / 0.95)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--hairline-strong)",
            boxShadow:
              "0 24px 64px oklch(0 0 0 / 0.85), 0 0 42px -10px oklch(0.78 0.11 150 / 0.28)",
          }}
        >
          {/* Top Progress Line */}
          <div
            className="h-[2px] w-full"
            style={{ background: "oklch(1 0 0 / 0.07)" }}
          >
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--color-neon), var(--color-gold))",
              }}
            />
          </div>

          <div className="p-3.5 sm:p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3.5">
              {/* Stop Artwork & Kicker */}
              <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                <img
                  src={currentStop.art}
                  alt={currentStop.chipLabel}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover shrink-0 border"
                  style={{ borderColor: "var(--hairline-strong)" }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="kicker !text-[0.6rem]">
                      {currentStop.kicker}
                    </span>
                    <span
                      className="mono text-[0.64rem] truncate"
                      style={{ color: "var(--color-gold)" }}
                    >
                      ▸ {actionText}
                    </span>
                  </div>

                  <h3 className="text-[0.95rem] sm:text-[1.05rem] font-semibold tracking-tight text-frost truncate">
                    {currentStop.title}
                  </h3>

                  <p className="text-fog text-[0.78rem] sm:text-[0.82rem] leading-snug line-clamp-2 mt-0.5">
                    {currentStop.summary}
                  </p>
                </div>
              </div>

              {/* Key Metrics Pills (Desktop) */}
              <div className="hidden lg:grid grid-cols-3 gap-2 shrink-0">
                {currentStop.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="px-2.5 py-1.5 rounded-lg border"
                    style={{
                      background: "oklch(0.16 0.008 270 / 0.7)",
                      borderColor: "var(--hairline)",
                    }}
                  >
                    <div
                      className="mono text-[0.55rem] uppercase tracking-wider"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {m.label}
                    </div>
                    <div className="stat-number text-[0.75rem] text-neon mt-0.5 whitespace-nowrap">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Transport & Stop Selector Row */}
            <div
              className="mt-3 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: "var(--hairline)" }}
            >
              {/* 6 Stop Chips */}
              <div className="chips overflow-x-auto max-w-full">
                {TOUR_STOPS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToStep(s.id, false)}
                    className={`chip !py-1 !px-2.5 !text-[0.72rem] ${
                      s.id === step ? "active" : ""
                    }`}
                    aria-pressed={s.id === step}
                  >
                    <span className="mono mr-1">{s.code}</span>
                    <span className="hidden sm:inline">{s.chipLabel}</span>
                  </button>
                ))}
              </div>

              {/* Transport Controls */}
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={() =>
                    goToStep(
                      ((step + TOUR_STOPS.length - 1) %
                        TOUR_STOPS.length) as TourStepIndex,
                      false
                    )
                  }
                  className="btn btn-ghost !py-1 !px-2.5 !text-xs"
                  title="Previous stop"
                >
                  ← Prev
                </button>

                <button
                  type="button"
                  onClick={() => setAutoPlay((p) => !p)}
                  className="btn btn-ghost !py-1 !px-2.5 !text-xs mono"
                  title={autoPlay ? "Pause auto-pilot" : "Resume auto-pilot"}
                >
                  {autoPlay ? "⏸ Auto" : "▶ Auto"}
                </button>

                {step < 5 ? (
                  <button
                    type="button"
                    onClick={() =>
                      goToStep(((step + 1) % TOUR_STOPS.length) as TourStepIndex, true)
                    }
                    className="btn btn-primary !py-1 !px-3 !text-xs"
                  >
                    Next Stop →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeTour();
                      router.push("/#buy");
                    }}
                    className="btn btn-primary !py-1 !px-3 !text-xs"
                  >
                    Buy $OWP →
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeTour}
                  aria-label="Exit live walkthrough"
                  className="btn btn-ghost !py-1 !px-2.5 !text-xs"
                  title="Exit walkthrough (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
