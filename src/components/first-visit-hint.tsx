"use client";

// A one-line, dismiss-forever hint for first-time players, gated by `id` in
// localStorage (dismiss it on any page and it never shows again, on any page
// sharing that id). Renders nothing once dismissed. Meant to orient players who
// don't read the standings — e.g. what a live bounty actually means.
import { useEffect, useState } from "react";

export function FirstVisitHint({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const key = `owp:hint:${id}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = true;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {}
    // Reveal only after mount (localStorage is client-only) — avoids showing a
    // hint the player already dismissed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dismissed) setShow(true);
  }, [key]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    setShow(false);
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 mb-4 text-xs"
      style={{
        background: "oklch(0.72 0.11 200 / 0.06)",
        border: "1px solid var(--hairline-strong)",
      }}
    >
      <span className="flex-1" style={{ color: "var(--text-dim)" }}>
        {children}
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="text-fog hover:text-frost transition-colors shrink-0 leading-none"
      >
        ✕
      </button>
    </div>
  );
}
