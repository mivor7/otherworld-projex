"use client";

// Live house activity — an auto-scrolling strip of recent (anonymized) wins,
// bids, burns and arcade scores. Pauses on hover; static under
// prefers-reduced-motion; hidden entirely while the house is quiet.
import Link from "next/link";
import { useEffect, useState } from "react";

type Event = { at: string; kind: string; text: string; href?: string; n?: number };

// A player repeating the same action produces identical adjacent lines
// ("…played Blackjack" ×4) that read as a rendering bug — collapse runs
// into one item with a count.
function collapseRuns(rows: Event[]): Event[] {
  const out: Event[] = [];
  for (const e of rows) {
    const last = out[out.length - 1];
    if (last && last.text === e.text && last.kind === e.kind && last.href === e.href) {
      last.n = (last.n ?? 1) + 1;
    } else {
      out.push({ ...e });
    }
  }
  return out;
}

const DOT: Record<string, string> = {
  win: "var(--color-gold)",
  award: "var(--color-gold)",
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
        .then((rows) => Array.isArray(rows) && setEvents(collapseRuns(rows)))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (events.length === 0) return null;

  const items = (keyPrefix: string) =>
    events.map((e, i) => {
      const inner = (
        <>
          <span className="ticker-dot" style={{ background: DOT[e.kind] ?? DOT.play }} />
          {e.text}
          {(e.n ?? 1) > 1 && (
            <span className="mono" style={{ color: "var(--text-dim)", marginLeft: "0.4em" }}>
              ×{e.n}
            </span>
          )}
        </>
      );
      return e.href ? (
        <Link
          key={`${keyPrefix}-${i}`}
          href={e.href}
          className="ticker-item"
          tabIndex={-1}
        >
          {inner}
        </Link>
      ) : (
        <span key={`${keyPrefix}-${i}`} className="ticker-item">
          {inner}
        </span>
      );
    });

  return (
    <div className="ticker-strip mt-4" aria-label="Recent house activity">
      <div className="ticker-track">
        {items("a")}
        {/* second copy exists only for the seamless marquee loop */}
        <span aria-hidden="true" style={{ display: "contents" }}>
          {items("b")}
        </span>
      </div>
    </div>
  );
}
