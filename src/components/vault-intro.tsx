"use client";

// One-time-per-session entrance: the vault doors part to reveal the house.
// Skipped for returning visitors (sessionStorage) and reduced-motion users.
import { useEffect, useState } from "react";

export function VaultIntro() {
  const [phase, setPhase] = useState<"idle" | "hold" | "open">("idle");

  useEffect(() => {
    if (
      sessionStorage.getItem("owp-intro") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    sessionStorage.setItem("owp-intro", "1");
    // One-time mount gate — must run after hydration to read sessionStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("hold");
    const t1 = setTimeout(() => setPhase("open"), 650);
    const t2 = setTimeout(() => setPhase("idle"), 2050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "idle") return null;
  return (
    <div
      className={`vault-intro ${phase === "open" ? "vault-intro--open" : ""}`}
      onClick={() => setPhase("idle")}
      aria-hidden
    >
      <div className="vault-door vault-door--left" />
      <div className="vault-door vault-door--right" />
      <div className="vault-seam" />
      <div className="vault-seal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/logo-seal.jpg" alt="" />
      </div>
    </div>
  );
}
