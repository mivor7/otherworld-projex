// Read-only staking data:
//   GET /api/staking → the official Streamflow pool's live stats + the
//                      caller's own position (when signed in).
// The app never custodies or signs for staked funds — staking happens on
// Streamflow with the user's own wallet; this endpoint just reads the chain
// (cached ~60s in lib/staking).
import { handler, ok } from "@/lib/api";
import { getSession } from "@/lib/session";
import { CONFIG, fromRaw } from "@/lib/config";
import { poolSnapshot } from "@/lib/staking";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [session, snap] = await Promise.all([getSession(), poolSnapshot()]);
  if (!snap) return ok({ pool: null, you: null });

  let you: { stakedRibbit: number; unlockAt: string | null } | null = null;
  if (session) {
    const mine = snap.stakes.get(session.wallet);
    if (mine) {
      you = {
        stakedRibbit: fromRaw(mine.amountRaw),
        unlockAt: mine.unlockTs > 0 ? new Date(mine.unlockTs * 1000).toISOString() : null,
      };
    } else {
      you = { stakedRibbit: 0, unlockAt: null };
    }
  }

  return ok({
    pool: {
      address: CONFIG.stakePool,
      streamflowUrl: `https://app.streamflow.finance/staking/solana/mainnet/${CONFIG.stakePool}`,
      totalStakedRibbit: fromRaw(snap.totalStakedRaw),
      capRibbit: snap.capRaw !== null ? fromRaw(snap.capRaw) : null,
      stakersCount: snap.stakes.size,
      aprPct: snap.aprPct,
      lockupDays: Math.round((snap.lockupSeconds / 86_400) * 10) / 10,
      rewardsFundedRibbit: fromRaw(snap.fundedRaw),
      rewardsClaimedRibbit: fromRaw(snap.claimedRaw),
      expiresAt: snap.expiresAt ? snap.expiresAt.toISOString() : null,
    },
    you,
  });
});
