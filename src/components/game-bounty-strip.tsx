"use client";

// A slim, glanceable "live bounty" strip pinned above a game's panel: the
// prize, how full the pool is, and — for a signed-in player in the running —
// their position and projected share. It signals "there's a live pool riding on
// this game right now" without making the player scroll to the standings or
// read closely. Renders nothing when the game has no open bounty. The full
// projected-split table still lives below the game (see BountyStandings); this
// is just the at-a-glance header. Polls so it stays live, and refreshes the
// instant a round settles.
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useSession } from "./session";
import { QualifyStatus } from "./qualify-status";

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
    lifetimeEligible: boolean;
    windowEligible: boolean;
    lifetimeSpent: number;
    windowSpent: number;
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

  // The glanceable one-liner about the player's own state — the canonical
  // qualify helper (compact) when they still need spend, else their standing.
  let statusNode: ReactNode = null;
  if (me.signedIn && you) {
    if (you.inRunning && you.projectedRibbit > 0) {
      statusNode = (
        <span className="text-neon">
          you&apos;re #{myRank ?? "—"} · ~{fmt(you.projectedRibbit)} $RIBBIT
        </span>
      );
    } else if (!you.spendEligible) {
      statusNode = <QualifyStatus you={you} compact />;
    } else if (you.value <= 0) {
      statusNode = (
        <span className="text-fog">
          {you.unit === "best score" ? "post a score to enter" : "go net-positive to enter"}
        </span>
      );
    } else {
      statusNode = <span className="text-neon">in the running</span>;
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
        {statusNode && <span className="text-xs ml-auto">{statusNode}</span>}
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
