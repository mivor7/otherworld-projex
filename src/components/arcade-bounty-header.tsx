"use client";

// Compact bounty header for an arcade game's single leaderboard card: when a
// bounty is live it shows the prize, that top scores share it weekly, and the
// signed-in player's own standing. Renders nothing when there's no open bounty,
// so the card is just a plain leaderboard then. This replaces the old two-card
// arrangement (a separate bounty panel above the leaderboard) with one card.
import { useSession } from "./session";
import { QualifyStatus } from "./qualify-status";
import { BountyEndedCard } from "./bounty-ended-card";
import { useBountyLive } from "./use-bounty-live";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function ArcadeBountyHeader({ game }: { game: string }) {
  const { me } = useSession();
  // Shared per-game poll (also refreshes on the owp:round signal a submitted
  // score fires, so the header updates the moment a run posts).
  const live = useBountyLive(game);

  const b = live?.bounty;
  const justEnded = live?.justEnded ?? null;
  if (!b && !justEnded) return null;

  const prize = b ? b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT` : "";
  const you = live?.you;
  const myRank = live?.entries.find((e) => e.isYou)?.rank;

  // Eligible players see their standing; not-eligible players get the canonical
  // "what you need to qualify" helper (rendered below the note).
  let eligibleStatus: { text: string; win: boolean } | null = null;
  if (b && me.signedIn && you && you.spendEligible) {
    if (you.inRunning && you.projectedRibbit > 0)
      eligibleStatus = {
        text: `You're in the running — #${myRank ?? "—"} · ~${fmt(you.projectedRibbit)} $RIBBIT`,
        win: true,
      };
    else if (you.value <= 0)
      eligibleStatus = { text: "Post a score to enter", win: false };
    else eligibleStatus = { text: "You're in the running", win: true };
  }

  return (
    <>
      {justEnded && <BountyEndedCard data={justEnded} />}
      {b && (
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
          {eligibleStatus && (
            <p className={`text-xs mt-1.5 ${eligibleStatus.win ? "text-neon" : "text-fog"}`}>
              {eligibleStatus.text}
            </p>
          )}
          {me.signedIn && you && !you.spendEligible && (
            <div className="mt-2.5">
              <QualifyStatus you={you} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
