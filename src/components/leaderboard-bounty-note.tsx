"use client";

// A one-line tie between a game's Weekly leaderboard and its live bounty: when a
// bounty is open for the game, this note makes explicit that scores on the board
// are racing for a real pool (the full prize + projected split is shown by
// BountyStandings directly above it on the same page). Renders nothing when the
// game has no open bounty, so the leaderboard reads as a plain leaderboard then.
import { useCallback, useEffect, useState } from "react";

type Bounty = { prizeRibbit: number; prizeText: string | null } | null;

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function LeaderboardBountyNote({ game }: { game: string }) {
  const [bounty, setBounty] = useState<Bounty>(null);

  const load = useCallback(() => {
    fetch(`/api/bounties/live?game=${game}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bounty?: Bounty } | null) => setBounty(d?.bounty ?? null))
      .catch(() => {});
  }, [game]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!bounty) return null;
  const prize = bounty.prizeText ?? `${fmt(bounty.prizeRibbit)} $RIBBIT`;

  return (
    <div
      className="rounded-lg px-3 py-2 mb-4 text-xs flex items-start gap-2"
      style={{
        background: "oklch(0.78 0.12 85 / 0.07)",
        border: "1px solid oklch(0.78 0.12 85 / 0.28)",
      }}
    >
      <span aria-hidden>🏆</span>
      <span style={{ color: "var(--text-dim)" }}>
        This week&apos;s top scores share the{" "}
        <span className="text-gold">{prize}</span> pool above — pays weekly.
      </span>
    </div>
  );
}
