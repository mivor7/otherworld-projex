// Bounty ranking + payout. The authoritative ranking lives here so the
// admin's payout-review preview and the actual award use the EXACT same
// computation — a winner list is never supplied by the client. Prizes are
// paid in real $RIBBIT through the same off-server payout worker as balance
// withdrawals (Withdrawal kind "bounty"), so all the hardened, race-safe,
// human-gated payout infrastructure applies unchanged.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CONFIG, fromRaw } from "./config";
import { burnTotals, eligibleBurners } from "./ranked";
import { ApiError } from "./api";

export const ARCADE_GAMES = new Set(["hopper", "frogris", "worm"]);

export type RankedEntry = {
  rank: number;
  userId: string;
  wallet: string;
  value: number; // best score (arcade) or net credits (tables)
  entries: number;
  volume?: number;
  burnedRibbit: number;
  windowBurnedRibbit: number;
  walletAgeDays: number;
};

type BountyLike = {
  id: string;
  game: string | null;
  startsAt: Date;
  kind: string;
};

/**
 * Eligible, ranked entries for a leaderboard bounty — burn-gated exactly like
 * the public boards, scored over the bounty's own window. Returns [] for
 * non-leaderboard or gameless bounties. `limit` caps how many places compute.
 */
export async function rankBountyEntries(
  bounty: BountyLike,
  limit = 10
): Promise<RankedEntry[]> {
  if (bounty.kind !== "leaderboard" || !bounty.game) return [];
  const game = bounty.game;

  let rows: { userId: string; value: number; entries: number; volume?: number }[];
  if (ARCADE_GAMES.has(game)) {
    const scores = await prisma.arcadeScore.groupBy({
      by: ["userId"],
      where: { game, createdAt: { gte: bounty.startsAt } },
      _max: { score: true },
      _count: true,
      orderBy: { _max: { score: "desc" } },
      take: 50,
    });
    rows = scores.map((s) => ({
      userId: s.userId,
      value: s._max.score ?? 0,
      entries: s._count,
    }));
  } else {
    const rounds = await prisma.gameRound.groupBy({
      by: ["userId"],
      where: { game, settled: true, createdAt: { gte: bounty.startsAt } },
      _sum: { payout: true, wager: true },
      _count: true,
      orderBy: { _sum: { payout: "desc" } },
      take: 200,
    });
    rows = rounds
      .map((r) => ({
        userId: r.userId,
        value: (r._sum.payout ?? 0) - (r._sum.wager ?? 0),
        entries: r._count,
        volume: r._sum.wager ?? 0,
      }))
      .sort((a, c) => c.value - a.value);
  }

  const ids = rows.map((r) => r.userId);
  const [eligible, burns, windowBurns, users] = await Promise.all([
    eligibleBurners(ids, bounty.startsAt),
    burnTotals(ids),
    burnTotals(ids, bounty.startsAt),
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, wallet: true, createdAt: true },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  return rows
    .filter((r) => eligible.has(r.userId))
    .filter((r) =>
      ARCADE_GAMES.has(game) ? true : (r.volume ?? 0) >= CONFIG.rankedMinTableVolume
    )
    // A prize only pays a positive result — a table bounty with everyone
    // net-negative pays nobody.
    .filter((r) => r.value > 0)
    .slice(0, limit)
    .map((r, i) => {
      const u = userById.get(r.userId);
      return {
        rank: i + 1,
        userId: r.userId,
        wallet: u?.wallet ?? "?",
        value: r.value,
        entries: r.entries,
        volume: r.volume,
        burnedRibbit: Math.round(fromRaw(burns.get(r.userId) ?? 0n)),
        windowBurnedRibbit: Math.round(fromRaw(windowBurns.get(r.userId) ?? 0n)),
        walletAgeDays: u
          ? Math.floor((Date.now() - u.createdAt.getTime()) / 86_400_000)
          : 0,
      };
    });
}

/**
 * Split a raw prize across N places by percentage. Sums to exactly the prize:
 * rounding dust is added to first place, so payouts never exceed the pot.
 */
export function splitPrize(prizeRaw: bigint, splits: number[]): bigint[] {
  const shares = splits.map((pct) => (prizeRaw * BigInt(Math.round(pct))) / 100n);
  const dust = prizeRaw - shares.reduce((a, b) => a + b, 0n);
  if (shares.length > 0) shares[0] += dust;
  return shares;
}

export type AwardResult = {
  bountyId: string;
  paid: { rank: number; wallet: string; amountRaw: string }[];
  totalRaw: string;
};

/**
 * Award a bounty: recompute the authoritative ranking, split the prize across
 * the given percentage places, and queue a treasury payout to each winner.
 * Atomic and idempotent — a bounty can only transition to "paid" once, so a
 * double-submit or a race can never double-pay.
 */
export async function awardBounty(
  bountyId: string,
  splits: number[]
): Promise<AwardResult> {
  if (splits.length === 0) throw new ApiError("Provide at least one prize split");
  if (splits.some((s) => s <= 0)) throw new ApiError("Splits must be positive");
  const sum = splits.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.001) throw new ApiError("Splits must sum to 100%");

  const bounty = await prisma.bounty.findUnique({ where: { id: bountyId } });
  if (!bounty) throw new ApiError("Bounty not found", 404);
  if (bounty.status === "paid") throw new ApiError("Bounty already paid", 409);
  if (bounty.kind !== "leaderboard" || !bounty.game) {
    throw new ApiError("Only leaderboard bounties pay automatically", 400);
  }

  const ranked = await rankBountyEntries(bounty, splits.length);
  if (ranked.length === 0) {
    throw new ApiError("No eligible winners to pay for this bounty", 400);
  }
  // Pay only as many places as there are eligible winners; re-normalize the
  // splits so the full pot is still distributed among those present.
  const usable = splits.slice(0, ranked.length);
  const usableSum = usable.reduce((a, b) => a + b, 0);
  const normalized = usable.map((s) => (s / usableSum) * 100);
  const shares = splitPrize(bounty.prizeRibbit, normalized);

  const result = await prisma.$transaction(async (tx) => {
    // Claim the bounty first: only the transition from a not-yet-paid state
    // succeeds, making the whole award once-only.
    const claimed = await tx.bounty.updateMany({
      where: { id: bountyId, status: { in: ["open", "closed"] } },
      data: { status: "paid", paidAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError("Bounty already paid or not payable", 409);
    }

    const paid: { rank: number; wallet: string; amountRaw: string }[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const e = ranked[i];
      const amountRaw = shares[i];
      if (amountRaw <= 0n) continue;
      // Treasury-funded payout — no user balance debit; flows through the
      // same worker as balance withdrawals.
      const wd = await tx.withdrawal.create({
        data: {
          userId: e.userId,
          amountRaw,
          destination: e.wallet,
          kind: "bounty",
          ref: bountyId,
        },
      });
      await tx.bountyAward.create({
        data: {
          bountyId,
          userId: e.userId,
          rank: e.rank,
          amountRaw,
          value: e.value,
          withdrawalId: wd.id,
        },
      });
      paid.push({ rank: e.rank, wallet: e.wallet, amountRaw: amountRaw.toString() });
    }

    await tx.treasuryEvent.create({
      data: {
        kind: "bounty_award",
        amount: bounty.prizeRibbit,
        asset: "RIBBIT",
        note: `Bounty paid: ${bounty.title} (${paid.length} winner${paid.length === 1 ? "" : "s"})`,
        ref: bountyId,
      },
    });

    return {
      bountyId,
      paid,
      totalRaw: shares.reduce((a, b) => a + b, 0n).toString(),
    } satisfies AwardResult;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return result;
}
