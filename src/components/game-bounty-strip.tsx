"use client";

// A slim, glanceable "live bounty" strip pinned above a game's panel: the
// prize, how full the pool is, and — for a signed-in player in the running —
// their position and projected share. It signals "there's a live pool riding on
// this game right now" without making the player scroll to the standings or
// read closely. Renders nothing when the game has no open bounty. The full
// projected-split table still lives below the game (see BountyStandings); this
// is just the at-a-glance header. Polls so it stays live, and refreshes the
// instant a round settles.
import { ReactNode } from "react";
import { useSession } from "./session";
import { QualifyStatus } from "./qualify-status";
import { BountyEndedCard } from "./bounty-ended-card";
import { useBountyLive } from "./use-bounty-live";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function GameBountyStrip({ game }: { game: string }) {
  const { me } = useSession();
  // Shared per-game poll — the standings panel on the same page consumes the
  // identical subscription instead of double-fetching.
  const live = useBountyLive(game);

  const b = live?.bounty;
  const justEnded = live?.justEnded ?? null;
  // Data arrived and there's genuinely nothing running: say so — a table with
  // no bounty must never look like a table with a hidden one. (The ended card
  // already explains the no-new-round case, so don't double up.)
  if (!b && !justEnded) {
    if (!live) return null; // still loading — don't flash the notice
    return (
      <div
        className="rounded-xl px-4 py-2.5 mb-3 text-xs text-fog"
        style={{ border: "1px solid var(--hairline)", background: "oklch(1 0 0 / 0.02)" }}
      >
        No live bounty on this table right now — you win and lose chips as
        normal, but nothing feeds a $RIBBIT prize until the house posts the
        next round.
      </div>
    );
  }

  const prize = b ? b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT` : "";
  const pct = b && b.progress?.mode === "credit" ? b.progress.pct : null;
  const you = live?.you;
  const myRank = live?.entries.find((e) => e.isYou)?.rank;

  // The glanceable one-liner about the player's own state — the canonical
  // qualify helper (compact) when they still need spend, else their standing.
  let statusNode: ReactNode = null;
  if (b && me.signedIn && you) {
    if (you.inRunning && you.projectedRibbit > 0) {
      statusNode = (
        <span className="text-neon">
          you&apos;re #{myRank ?? "—"} · ~{fmt(you.projectedRibbit)} $RIBBIT
        </span>
      );
    } else if (!you.spendEligible || you.volumeEligible === false) {
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
    <>
      {justEnded && <BountyEndedCard data={justEnded} />}
      {b && (
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
              {b.round !== undefined && ` · r${b.round}`}
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
                {pct}% · pot grows as you play
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
