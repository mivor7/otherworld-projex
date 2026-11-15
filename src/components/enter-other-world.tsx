"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SealMark } from "@/components/seal";

export type ChapterIndex = 0 | 1 | 2 | 3 | 4;

interface ChapterMeta {
  id: ChapterIndex;
  roman: string;
  shortTitle: string;
  title: string;
  route: string;
  spotlightSelector: string;
  caption: string;
}

export const CHAPTERS: ChapterMeta[] = [
  {
    id: 0,
    roman: "I",
    shortTitle: "The Treasury",
    title: "The House Wallet & Live Raydium Desk",
    route: "/",
    spotlightSelector: "#buy .panel",
    caption:
      "Sign in with a free message signature. Pay SOL to the house wallet at the live Raydium price — or deposit $OWP 1:1 into your balance.",
  },
  {
    id: 1,
    roman: "II",
    shortTitle: "Frog Flip",
    title: "Wing I — Provably-Fair Frog Flip",
    route: "/games/flip",
    spotlightSelector: ".game-stage",
    caption:
      "Call frog or fly at a published 4% edge (1.92× a win). Every round commits a SHA-256 server seed hash upfront — ride the streak or bank the pot.",
  },
  {
    id: 2,
    roman: "III",
    shortTitle: "Pond Dice",
    title: "Wing I — Custom-Line Pond Dice",
    route: "/games/dice",
    spotlightSelector: ".game-stage",
    caption:
      "Set your own line and roll under it. Steeper lines multiply payouts up to 96× under the same verifiable seed protocol.",
  },
  {
    id: 3,
    roman: "IV",
    shortTitle: "Hopper",
    title: "Wing I — 60 Hz Replay-Verified Arcade",
    route: "/games/hopper",
    spotlightSelector: ".game-stage",
    caption:
      "Hopper, Frogris, and Worm Frog are free to play. Every hop is recorded by frame index and re-simulated at 60 Hz on the server to verify high scores.",
  },
  {
    id: 4,
    roman: "V",
    shortTitle: "Bounties",
    title: "Wing III — Self-Filling Bounty Pools",
    route: "/bounties",
    spotlightSelector: "main .panel",
    caption:
      "Half of the house edge from every table bet feeds that game's bounty pool. When the unlock meter fills, every eligible winner is paid pro-rata automatically.",
  },
];

const CHAPTER_DURATION_MS = 10500;

export function startOtherWorldTour(chapter: ChapterIndex = 0) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("owp:enter-other-world", { detail: { chapter } })
  );
}

/**
 * Understated, architectural invitation strip on the homepage.
 * Matches the editorial voice and restraint of /about and /whitepaper.
 */
export function EnterOtherWorld() {
  return (
    <section className="mt-8" aria-label="Enter the Other World">
      <div className="panel panel-glow panel-etched p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <div className="shrink-0 hidden sm:block">
              <SealMark size={48} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="kicker">The House Prologue</span>
                <span
                  className="mono text-[0.62rem]"
                  style={{ color: "var(--text-dim)" }}
                >
                  · 5 live chapters
                </span>
              </div>
              <h2 className="text-[1.35rem] sm:text-[1.5rem] tracking-tight">
                Enter the <span className="text-neon">Other World</span>
              </h2>
              <p className="text-fog text-[0.88rem] leading-relaxed max-w-2xl mt-1">
                Somewhere past the last block of the chain there is a vault carved
                into black marble, and inside it, an arcade. Take a guided run
                across the live house — from the treasury desk to the tables,
                skill cabinets, and bounty boards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => startOtherWorldTour(0)}
              className="btn btn-primary btn-lg"
              data-magnetic
            >
              Enter the Other World →
            </button>
          </div>
        </div>

        <div
          className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => startOtherWorldTour(c.id)}
                className="chip !py-1 !px-2.5 !text-[0.74rem]"
              >
                <span className="mono text-neon mr-1.5">{c.roman}</span>
                {c.shortTitle}
              </button>
            ))}
          </div>
          <span
            className="mono text-[0.65rem] hidden md:inline"
            style={{ color: "var(--text-dim)" }}
          >
            Autonomous live walkthrough · Step off at any table to play
          </span>
        </div>
      </div>
    </section>
  );
}

function clearSpotlightAttributes() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll("[data-owp-spotlight]")
    .forEach((el) => el.removeAttribute("data-owp-spotlight"));
  document
    .querySelectorAll("[data-owp-clicked]")
    .forEach((el) => el.removeAttribute("data-owp-clicked"));
}

function findButton(
  rootSelector: string,
  match: string | RegExp
): HTMLButtonElement | null {
  if (typeof document === "undefined") return null;
  const root = document.querySelector(rootSelector) ?? document.body;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of buttons) {
    const text = (btn.textContent ?? "").trim();
    const ok =
      typeof match === "string"
        ? text.toLowerCase().includes(match.toLowerCase())
        : match.test(text);
    if (ok && btn.offsetParent !== null) return btn;
  }
  return null;
}

function ensurePracticeSandbox() {
  const chip = findButton(".game-stage", "Sandbox");
  if (chip && chip.getAttribute("aria-pressed") !== "true") {
    try {
      chip.click();
    } catch {
      // ignore
    }
  }
}

/**
 * Center an element cleanly in the open viewport area between the top navbar
 * and the bottom cinema bar — called INSTANTLY while the Chapter Curtain is opaque
 * so the user never sees a scroll jump.
 */
function centerElementInstantly(el: Element) {
  if (typeof window === "undefined") return;
  const r = el.getBoundingClientRect();
  const topInset = 76;
  const bottomInset = 128;
  const availH = Math.max(240, window.innerHeight - topInset - bottomInset);
  const desiredTop =
    topInset + Math.max(12, (availH - Math.min(r.height, availH * 0.88)) * 0.42);
  const nextScrollY = Math.max(0, window.scrollY + r.top - desiredTop);
  window.scrollTo({ top: nextScrollY, behavior: "instant" as ScrollBehavior });
}

/**
 * Persistent Live Website Cinema Director (mounted in RootLayout).
 * Uses a seamless Chapter Dissolve Curtain during route/scroll transitions,
 * compositor-native [data-owp-spotlight] illumination, and a 60fps lerp
 * luminous ring pointer that drives the actual live pages.
 */
export function OtherWorldDirector() {
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [chapter, setChapter] = useState<ChapterIndex>(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [progress, setProgress] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const [caption, setCaption] = useState(CHAPTERS[0].caption);
  const [clicking, setClicking] = useState(false);
  const [pointerVisible, setPointerVisible] = useState(false);

  // Direct DOM refs for 60fps silky-smooth pointer lerp without React re-renders
  const pointerElRef = useRef<HTMLDivElement | null>(null);
  const pointerTargetElRef = useRef<HTMLElement | null>(null);
  const posRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
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

  const stopTour = useCallback(() => {
    clearTimers();
    clearSpotlightAttributes();
    if (typeof document !== "undefined") {
      document.documentElement.removeAttribute("data-owp-tour");
    }
    pointerTargetElRef.current = null;
    setPointerVisible(false);
    setCurtain(false);
    setStageReady(false);
    setActive(false);
  }, [clearTimers]);

  // Listen for global launch event
  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<{ chapter?: ChapterIndex }>).detail;
      const startChapter = detail?.chapter ?? 0;
      clearTimers();
      clearSpotlightAttributes();
      document.documentElement.setAttribute("data-owp-tour", "1");
      posRef.current = {
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.45,
        tx: window.innerWidth * 0.5,
        ty: window.innerHeight * 0.45,
      };
      setChapter(startChapter);
      setCaption(CHAPTERS[startChapter].caption);
      setProgress(0);
      setAutoPlay(true);
      setStageReady(false);
      setCurtain(true);
      setActive(true);
    };
    window.addEventListener("owp:enter-other-world", onStart);
    return () => window.removeEventListener("owp:enter-other-world", onStart);
  }, [clearTimers]);

  const jumpToChapter = useCallback(
    (next: ChapterIndex, keepAuto = true) => {
      clearTimers();
      clearSpotlightAttributes();
      pointerTargetElRef.current = null;
      setPointerVisible(false);
      setStageReady(false);
      setCurtain(true);
      setProgress(0);
      setAutoPlay(keepAuto);
      setCaption(CHAPTERS[next].caption);
      setChapter(next);
    },
    [clearTimers]
  );

  // Escape key exits cleanly
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stopTour]);

  // 60fps Lerp Loop for the Luminous Ring Pointer
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const stepFrame = () => {
      const targetEl = pointerTargetElRef.current;
      if (targetEl && targetEl.offsetParent !== null) {
        const r = targetEl.getBoundingClientRect();
        posRef.current.tx = r.left + r.width * 0.5;
        posRef.current.ty = r.top + r.height * 0.5;
      }
      posRef.current.x += (posRef.current.tx - posRef.current.x) * 0.14;
      posRef.current.y += (posRef.current.ty - posRef.current.y) * 0.14;

      if (pointerElRef.current) {
        pointerElRef.current.style.transform = `translate3d(${posRef.current.x.toFixed(
          1
        )}px, ${posRef.current.y.toFixed(1)}px, 0)`;
      }
      raf = window.requestAnimationFrame(stepFrame);
    };
    raf = window.requestAnimationFrame(stepFrame);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);

  // Smoothly glide the luminous ring to a live DOM element and click it
  const glideAndClick = useCallback(
    (
      getEl: () => HTMLElement | null,
      nextCaption?: string,
      doClick = true
    ) => {
      if (nextCaption) setCaption(nextCaption);
      const el = getEl();
      if (!el) return;
      pointerTargetElRef.current = el;
      setPointerVisible(true);

      if (doClick) {
        schedule(() => {
          const fresh = getEl() ?? el;
          pointerTargetElRef.current = fresh;
          setClicking(true);
          fresh.setAttribute("data-owp-clicked", "1");
          try {
            fresh.click();
          } catch {
            // ignore
          }
          schedule(() => {
            setClicking(false);
            fresh.removeAttribute("data-owp-clicked");
          }, 360);
        }, 620);
      }
    },
    [schedule]
  );

  // Continuous progress bar & chapter auto-advance (runs once curtain opens)
  useEffect(() => {
    if (!active || !stageReady || !autoPlay) return;
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / CHAPTER_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed >= CHAPTER_DURATION_MS) {
        window.clearInterval(id);
        if (chapter < 4) {
          jumpToChapter((chapter + 1) as ChapterIndex, true);
        } else {
          // Finished all 5 chapters — leave the user on the live site ready to explore
          stopTour();
        }
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [active, stageReady, autoPlay, chapter, jumpToChapter, stopTour]);

  // Choreograph each chapter: wait for route + DOM behind the Chapter Curtain,
  // snap scroll & illuminate target panel, dissolve curtain, then perform live plays.
  useEffect(() => {
    if (!active) return;
    clearTimers();

    const meta = CHAPTERS[chapter];

    if (pathname !== meta.route) {
      router.push(meta.route);
      return;
    }

    let attempts = 0;
    const prepareStageBehindCurtain = () => {
      const panel = document.querySelector(
        meta.spotlightSelector
      ) as HTMLElement | null;
      if (!panel && attempts < 25) {
        attempts += 1;
        schedule(prepareStageBehindCurtain, 100);
        return;
      }

      clearSpotlightAttributes();
      if (chapter === 1 || chapter === 2) {
        ensurePracticeSandbox();
      }

      if (panel) {
        centerElementInstantly(panel);
        panel.setAttribute("data-owp-spotlight", "active");
        const r = panel.getBoundingClientRect();
        posRef.current.tx = r.left + r.width * 0.5;
        posRef.current.ty = r.top + r.height * 0.5;
      }

      // Dissolve the chapter curtain smoothly once the stage is framed
      schedule(() => {
        setCurtain(false);
        setStageReady(true);
      }, 320);

      // Run the live page interactions for this chapter
      if (chapter === 0) {
        // Chapter I: Homepage #buy Treasury Desk
        schedule(() => {
          glideAndClick(
            () => findButton("#buy", "0.1 SOL"),
            "Sign in with a free message signature — the treasury desk quotes 0.1 SOL at the live Raydium spot rate."
          );
        }, 900);

        schedule(() => {
          glideAndClick(
            () => findButton("#buy", "0.5 SOL"),
            "Selecting 0.5 SOL updates the live $OWP payout from the house wallet."
          );
        }, 3800);

        schedule(() => {
          glideAndClick(
            () => findButton("#buy", "1 SOL"),
            "Or deposit existing $OWP 1:1 into your balance and withdraw anytime."
          );
        }, 6800);
      } else if (chapter === 1) {
        // Chapter II: Frog Flip (/games/flip)
        schedule(() => {
          ensurePracticeSandbox();
          glideAndClick(
            () => findButton(".game-stage", "Frog"),
            "Calling Frog on the table — every round locks a SHA-256 server seed hash before the flip."
          );
        }, 850);

        schedule(() => {
          ensurePracticeSandbox();
          glideAndClick(
            () =>
              findButton(
                ".game-stage",
                /Flip \(practice\)|Flip it|Double or nothing/i
              ),
            "Flipping the 3D coin at a published 4% house edge (1.92× payout)…"
          );
        }, 2300);

        schedule(() => {
          ensurePracticeSandbox();
          glideAndClick(
            () =>
              findButton(
                ".game-stage",
                /Double or nothing|Flip \(practice\)|Flip it/i
              ),
            "Won the call — riding the double-or-nothing streak ladder on the next flip."
          );
        }, 6200);
      } else if (chapter === 2) {
        // Chapter III: Pond Dice (/games/dice)
        schedule(() => {
          ensurePracticeSandbox();
          window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: 32 }));
          glideAndClick(
            () =>
              document.querySelector(
                '.game-stage input[type="range"]'
              ) as HTMLElement | null,
            "Setting the Pond Dice win zone under 32 for a 3.00× payout multiplier…",
            false
          );
        }, 850);

        schedule(() => {
          ensurePracticeSandbox();
          glideAndClick(
            () => findButton(".game-stage", /Roll \(practice\)|Roll/i),
            "Rolling under 32 — every wager also feeds 50% of the house edge to the game's bounty pool."
          );
        }, 2400);

        schedule(() => {
          ensurePracticeSandbox();
          window.dispatchEvent(new CustomEvent("owp:dice-target", { detail: 64 }));
          glideAndClick(
            () =>
              document.querySelector(
                '.game-stage input[type="range"]'
              ) as HTMLElement | null,
            "Widening the line to 64% (1.50× multiplier) for a higher-probability roll…",
            false
          );
        }, 5600);

        schedule(() => {
          ensurePracticeSandbox();
          glideAndClick(
            () => findButton(".game-stage", /Roll \(practice\)|Roll/i),
            "Rolling again — every outcome is verifiable on the Fairness page."
          );
        }, 7000);
      } else if (chapter === 3) {
        // Chapter IV: Hopper (/games/hopper)
        schedule(() => {
          const startBtn = findButton(
            ".game-stage",
            /Start hopping|Hop again/i
          );
          if (startBtn) {
            glideAndClick(
              () => findButton(".game-stage", /Start hopping|Hop again/i),
              "Launching a free 60 Hz Hopper run — traffic is seeded deterministically and replayed on the server."
            );
          }
        }, 850);

        schedule(() => {
          glideAndClick(
            () => document.querySelector(".game-stage canvas") as HTMLElement | null,
            "Every hop is recorded by frame index so bots cannot forge a leaderboard score.",
            false
          );
        }, 3400);
      } else if (chapter === 4) {
        // Chapter V: Bounties (/bounties)
        schedule(() => {
          glideAndClick(
            () => findButton("main", "Frogris"),
            "Table bounties unlock as their game is played; free arcade episodes pay weekly."
          );
        }, 1100);

        schedule(() => {
          glideAndClick(
            () => findButton("main", "Worm Frog"),
            "When a bounty pool unlocks, every eligible hunter is paid pro-rata automatically."
          );
        }, 4400);

        schedule(() => {
          glideAndClick(
            () => findButton("main", "Hopper"),
            "Step off at any wing below — the hunt is always open."
          );
        }, 7400);
      }
    };

    schedule(prepareStageBehindCurtain, 180);

    return () => clearTimers();
  }, [active, chapter, pathname, router, clearTimers, schedule, glideAndClick]);

  if (!active) return null;

  const currentMeta = CHAPTERS[chapter];

  return (
    <>
      {/* Soft ambient vignette behind the illuminated [data-owp-spotlight] panel */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[42] pointer-events-none transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(85% 70% at 50% 45%, oklch(0.06 0.008 270 / 0.35), oklch(0.05 0.008 270 / 0.72))",
        }}
      />

      {/* Seamless Chapter Dissolve Curtain — hides route & scroll transitions completely */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[55] pointer-events-none flex flex-col items-center justify-center transition-opacity duration-500 ${
          curtain ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background: "oklch(0.08 0.008 270 / 0.96)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <SealMark size={48} />
          <div className="kicker mt-1">Chapter {currentMeta.roman} of V</div>
          <div
            className="text-xl sm:text-2xl font-medium tracking-tight text-frost"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {currentMeta.title}
          </div>
        </div>
      </div>

      {/* 60fps Lerp Luminous Ring Pointer (minimal glass & pearl reticle, zero tacky labels) */}
      <div
        ref={pointerElRef}
        aria-hidden="true"
        className={`fixed left-0 top-0 z-[52] pointer-events-none transition-opacity duration-300 ${
          pointerVisible && !curtain ? "opacity-100" : "opacity-0"
        }`}
        style={{ willChange: "transform" }}
      >
        <div
          className="relative -left-4 -top-4 w-8 h-8 flex items-center justify-center"
          style={{
            transform: clicking ? "scale(0.78)" : "scale(1)",
            transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {clicking && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{
                border: "1.5px solid oklch(0.82 0.11 150 / 0.85)",
                background: "oklch(0.78 0.11 150 / 0.2)",
              }}
            />
          )}
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              border: "1.5px solid oklch(0.85 0.1 150 / 0.85)",
              background: "oklch(0.78 0.11 150 / 0.14)",
              boxShadow: "0 4px 20px oklch(0 0 0 / 0.65)",
              backdropFilter: "blur(3px)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: "oklch(0.92 0.09 150)",
                boxShadow: "0 0 10px oklch(0.78 0.11 150)",
              }}
            />
          </span>
        </div>
      </div>

      {/* Editorial Bottom Cinema Bar */}
      <aside
        role="region"
        aria-label="House prologue controls"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[56] w-[calc(100vw-1.5rem)] max-w-3xl"
      >
        <div
          className="panel panel-glow overflow-hidden"
          style={{
            background: "oklch(0.115 0.008 270 / 0.94)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--hairline-strong)",
            boxShadow: "0 24px 70px oklch(0 0 0 / 0.85)",
          }}
        >
          {/* 5 Segmented Chapter Progress Bars along the top edge */}
          <div className="grid grid-cols-5 gap-1 px-3 pt-2.5">
            {CHAPTERS.map((c) => {
              const isPast = c.id < chapter;
              const isCurr = c.id === chapter;
              const fill = isPast ? 100 : isCurr ? progress : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => jumpToChapter(c.id, false)}
                  className="group text-left cursor-pointer py-0.5"
                  title={`${c.roman} · ${c.shortTitle}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`mono text-[0.58rem] ${
                        isCurr
                          ? "text-neon font-semibold"
                          : "text-fog group-hover:text-frost"
                      }`}
                    >
                      {c.roman}
                    </span>
                    <span className="hidden sm:inline text-[0.62rem] text-fog group-hover:text-frost truncate">
                      {c.shortTitle}
                    </span>
                  </div>
                  <div
                    className="h-[2px] w-full rounded-full overflow-hidden"
                    style={{ background: "oklch(1 0 0 / 0.1)" }}
                  >
                    <div
                      className="h-full transition-all duration-75"
                      style={{
                        width: `${fill}%`,
                        background: "var(--color-neon)",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Caption & Controls Row */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="kicker !text-[0.58rem]">
                  Chapter {currentMeta.roman} · {currentMeta.shortTitle}
                </span>
              </div>
              <p className="text-frost text-[0.84rem] leading-snug">
                {caption}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setAutoPlay((p) => !p)}
                className="btn btn-ghost !py-1.5 !px-2.5 !text-xs mono"
                title={autoPlay ? "Pause walkthrough" : "Resume walkthrough"}
              >
                {autoPlay ? "Pause" : "Resume"}
              </button>

              <button
                type="button"
                onClick={stopTour}
                className="btn btn-primary !py-1.5 !px-3.5 !text-xs"
              >
                Explore Here →
              </button>

              <button
                type="button"
                onClick={stopTour}
                aria-label="Close walkthrough"
                className="btn btn-ghost !py-1.5 !px-2.5 !text-xs"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
