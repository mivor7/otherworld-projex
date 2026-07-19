"use client";

// One-time-per-session entrance: the house vault unlocks and parts to reveal
// the page. Zero-delay by design — a pre-paint inline script in the layout
// sets <html data-intro="1"> on a first visit, this markup is in the server
// HTML, and the whole sequence is pure CSS animation. Nothing waits for
// hydration; the closed vault is the very first painted frame. JS here only
// handles click-to-skip and removing the flag when the show ends.
import { useEffect } from "react";
import { SealMark } from "./seal";

const DISMISS = () => document.documentElement.removeAttribute("data-intro");

export function VaultIntro() {
  useEffect(() => {
    // The CSS finishes (and hides itself) at ~2.8s; drop the flag shortly
    // after so the overlay leaves the tree state entirely.
    const t = setTimeout(DISMISS, 3200);
    return () => clearTimeout(t);
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
