"use client";

// Compact bounty header for an arcade game's single leaderboard card: when a
// bounty is live it shows the prize, that top scores share it weekly, and the
// signed-in player's own standing. Renders nothing when there's no open bounty,
// so the card is just a plain leaderboard then. This replaces the old two-card
// arrangement (a separate bounty panel above the leaderboard) with one card.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./session";

type Live = {
  bounty: { prizeRibbit: number; prizeText: string | null } | null;
  entries: { rank: number; isYou: boolean }[];
  you: {
    inRunning: boolean;
    value: number;
    projectedRibbit: number;
    spendEligible: boolean;
  } | null;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function ArcadeBountyHeader({ game }: { game: string }) {
  const { me } = useSession();
  const [live, setLive] = useState<Live | null>(null);

  const load = useCallback(() => {
    fetch(`/api/bounties/live?game=${game}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLive(d))
      .catch(() => {});
  }, [game]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const b = live?.bounty;
  if (!b) return null;

  const prize = b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT`;
  const you = live?.you;
  const myRank = live?.entries.find((e) => e.isYou)?.rank;

  let status: { text: string; win: boolean } | null = null;
  if (me.signedIn && you) {
    if (you.inRunning && you.projectedRibbit > 0) {
      status = {
        text: `You're in the running — #${myRank ?? "—"} · ~${fmt(you.projectedRibbit)} $RIBBIT`,
        win: true,
      };
    } else if (!you.spendEligible) {
      status = { text: "Not eligible yet — buy credits to qualify", win: false };
    } else if (you.value <= 0) {
      status = { text: "Post a score to enter", win: false };
    } else {
      status = { text: "You're in the running", win: true };
    }
  }

  return (
    <div className="mb-4 pb-4 border-b" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge badge-live">
          <span className="live-dot" /> live bounty
        </span>
        <span className="stat-number text-gold text-sm ml-auto">{prize}</span>
      </div>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        Top scores share this pool, paid weekly to eligible hunters.
      </p>
      {status && (
        <p className={`text-xs mt-1.5 ${status.win ? "text-neon" : "text-fog"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
