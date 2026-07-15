"use client";

// Live house activity — an auto-scrolling strip of recent (anonymized) wins,
// bids, burns and arcade scores. Pauses on hover; static under
// prefers-reduced-motion; hidden entirely while the house is quiet.
import { useEffect, useState } from "react";

type Event = { at: string; kind: string; text: string };

const DOT: Record<string, string> = {
  win: "var(--color-gold)",
  bid: "var(--color-portal)",
  burn: "var(--color-danger)",
  score: "var(--color-neon)",
  play: "var(--color-fog)",
};

export function ActivityTicker() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/activity")
        .then((r) => r.json())
        .then((rows) => Array.isArray(rows) && setEvents(rows))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (events.length === 0) return null;

  const items = (keyPrefix: string) =>
    events.map((e, i) => (
      <span key={`${keyPrefix}-${i}`} className="ticker-item">
        <span className="ticker-dot" style={{ background: DOT[e.kind] ?? DOT.play }} />
        {e.text}
      </span>
    ));

  return (
    <div className="ticker-strip mt-4" aria-label="Recent house activity">
      <div className="ticker-track">
        {items("a")}
        {items("b")}
      </div>
    </div>
  );
}
