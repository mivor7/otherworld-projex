"use client";

// One-time-per-session entrance: the house vault unlocks and parts to reveal
// the page. Two-phase choreography, all CSS:
//   · data-intro     — set PRE-PAINT by an inline script at the top of the
//     layout; shows the closed vault (engrave, wheel turn) from the very
//     first frame. A body::before curtain guarantees nothing else can paint
//     first, even before this markup streams.
//   · data-intro-go  — set by an inline script at the END of the body (so the
//     page content above it has streamed, with a 1.15s minimum) and starts
//     the reveal: seam bloom, doors part onto the REAL page, overlay fades.
// JS here only handles click-to-skip, a hydration fallback for the go flag,
// and removing the flags once the show ends.
import { useEffect } from "react";
import { SealMark } from "./seal";

const DISMISS = () => {
  const h = document.documentElement;
  h.removeAttribute("data-intro");
  h.removeAttribute("data-intro-go");
};

export function VaultIntro() {
  useEffect(() => {
    const h = document.documentElement;
    if (h.getAttribute("data-intro") !== "1") return; // not playing this session

    let endTimer: ReturnType<typeof setTimeout> | null = null;
    // The reveal runs ~1.8s after the go flag lands — clean up shortly after.
    const armEnd = () => {
      if (!endTimer) endTimer = setTimeout(DISMISS, 2100);
    };
    if (h.getAttribute("data-intro-go") === "1") armEnd();
    const mo = new MutationObserver(() => {
      if (h.getAttribute("data-intro-go") === "1") armEnd();
    });
    mo.observe(h, { attributes: true, attributeFilter: ["data-intro-go"] });

    // Fallback: hydration itself proves the page exists — if the end-of-body
    // script somehow didn't run, set the flag from here on the same clock.
    const goFallback = setTimeout(
      () => {
        if (h.getAttribute("data-intro") === "1") h.setAttribute("data-intro-go", "1");
      },
      Math.max(0, 1150 - performance.now())
    );
    // Absolute cap — the overlay can never hold the page hostage.
    const hardCap = setTimeout(DISMISS, 8000);

    return () => {
      mo.disconnect();
      if (endTimer) clearTimeout(endTimer);
      clearTimeout(goFallback);
      clearTimeout(hardCap);
    };
  }, []);

  return (
    <div className="vault-intro" onClick={DISMISS} aria-hidden>
      <div className="vault-door vault-door--left" />
      <div className="vault-door vault-door--right" />
      <div className="vault-seam" />
      <div className="vault-center">
        <div className="vault-wheel">
          <span className="vault-wheel-ticks" />
          <span className="vault-wheel-ring" />
          <div className="vault-seal">
            <SealMark size={96} />
          </div>
        </div>
        <div className="vault-word">
          <span className="vault-word-main">Other World Projex</span>
          <span className="vault-word-sub">The $RIBBIT House</span>
        </div>
      </div>
      <div className="vault-vignette" />
    </div>
  );
}
