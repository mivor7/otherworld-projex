"use client";

// A slim, glanceable "live bounty" strip pinned above a game's panel: the
// prize, how full the pool is, and — for a signed-in player in the running —
// their position and projected share. It signals "there's a live pool riding on
// this game right now" without making the player scroll to the standings or
// read closely. Renders nothing when the game has no open bounty. The full
// projected-split table still lives below the game (see BountyStandings); this
// is just the at-a-glance header. Polls so it stays live, and refreshes the
// instant a round settles.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./session";

type Entry = { rank: number; isYou: boolean };
type Progress =
  | { mode: "credit"; spent: number; threshold: number; pct: number }
  | { mode: "time"; endsAt: string }
  | null;
type Live = {
  bounty: {
    id: string;
    title: string;
    prizeRibbit: number;
    prizeText: string | null;
    progress: Progress;
  } | null;
  entries: Entry[];
  you: {
    inRunning: boolean;
    value: number;
    unit: "net credits" | "best score";
    projectedRibbit: number;
    spendEligible: boolean;
  } | null;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function GameBountyStrip({ game }: { game: string }) {
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
    const t = setInterval(load, 8_000);
    const onRound = () => load();
    window.addEventListener("owp:round", onRound);
    return () => {
      clearInterval(t);
      window.removeEventListener("owp:round", onRound);
    };
  }, [load]);

  const b = live?.bounty;
  if (!b) return null;

  const prize = b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT`;
  const pct = b.progress?.mode === "credit" ? b.progress.pct : null;
  const you = live?.you;
  const myRank = live?.entries.find((e) => e.isYou)?.rank;

  // The glanceable one-liner about the player's own state — win-tinted when
  // they're actually in line to be paid, dim when they still need to qualify.
  let mine: { text: string; win: boolean } | null = null;
  if (me.signedIn && you) {
    if (you.inRunning && you.projectedRibbit > 0) {
      mine = { text: `you're #${myRank ?? "—"} · ~${fmt(you.projectedRibbit)} $RIBBIT`, win: true };
    } else if (!you.spendEligible) {
      mine = { text: "not in the running — buy credits", win: false };
    } else if (you.value <= 0) {
      mine = {
        text: you.unit === "best score" ? "post a score to enter" : "go net-positive to enter",
        win: false,
      };
    } else {
      mine = { text: "in the running", win: true };
    }
  }

  return (
    <div
      className="rounded-xl px-4 py-3 mb-3"
      style={{
        background: "oklch(0.78 0.12 85 / 0.06)",
        border: "1px solid oklch(0.78 0.12 85 / 0.28)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge badge-live">
          <span className="live-dot" /> live bounty
        </span>
        <span className="stat-number text-gold text-sm">{prize} pool</span>
        {mine && (
          <span className={`text-xs ml-auto ${mine.win ? "text-neon" : "text-fog"}`}>
            {mine.text}
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 rounded-full overflow-hidden"
            style={{ background: "oklch(0.22 0.01 165)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
              }}
            />
          </div>
          <span
            className="mono text-[0.65rem] whitespace-nowrap"
            style={{ color: "var(--text-dim)" }}
          >
            {pct}% · fills as you play
          </span>
        </div>
      )}
    </div>
  );
}
