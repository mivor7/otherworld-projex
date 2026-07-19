// Bounty ranking + payout. The authoritative ranking lives here so the
// admin's payout-review preview and the actual award use the EXACT same
// computation — a winner list is never supplied by the client. Prizes are
// paid in real $RIBBIT through the same off-server payout worker as balance
// withdrawals (Withdrawal kind "bounty"), so all the hardened, race-safe,
// human-gated payout infrastructure applies unchanged.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fromRaw } from "./config";
import { burnTotals, eligibleBurners } from "./ranked";
import { houseConfig } from "./settings";
import { getTreasuryStats } from "./solana";
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
  const [eligible, burns, windowBurns, users, cfg] = await Promise.all([
    eligibleBurners(ids, bounty.startsAt),
    burnTotals(ids),
    burnTotals(ids, bounty.startsAt),
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, wallet: true, createdAt: true },
    }),
    houseConfig(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  return rows
    .filter((r) => eligible.has(r.userId))
    .filter((r) =>
      ARCADE_GAMES.has(game) ? true : (r.volume ?? 0) >= cfg.rankedMinTableVolume
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

/**
 * Auto-derive a credit-game bounty's spend threshold from its prize: require
 * enough play that the house edge-take covers the prize plus the configured
 * margin. trigger = (prizeCredits × (1 + margin)) / edge. This guarantees a
 * bounty that pays out has already earned the house more than it costs.
 */
export async function computeTriggerCreditVolume(prizeRaw: bigint): Promise<number> {
  const cfg = await houseConfig();
  const prizeCredits = fromRaw(prizeRaw) / cfg.ribbitPerCredit;
  const vol = Math.ceil(
    (prizeCredits * (1 + cfg.bountyHouseMargin)) / cfg.houseEdge
  );
  return Math.max(1, vol);
}

/** Total credits wagered on a game since `since` — the auto-bounty trigger. */
export async function creditSpendForGame(game: string, since: Date): Promise<number> {
  const agg = await prisma.gameRound.aggregate({
    where: { game, createdAt: { gte: since } },
    _sum: { wager: true },
  });
  return agg._sum.wager ?? 0;
}

/**
 * The trigger a credit bounty must actually satisfy RIGHT NOW: never weaker
 * than what was posted, and never weaker than what today's live economy
 * (edge / credit price / margin) demands. Stored triggers are derived at
 * creation — if an admin later softens the economy (lower edge, cheaper
 * credits), the stored threshold would under-charge for the prize and break
 * the house-nets-positive invariant. max() keeps both promises: the meter
 * players saw can only be met or raised, and a pool that pays has always
 * earned its keep at current rules.
 */
async function effectiveTriggerVolume(bounty: {
  prizeRibbit: bigint;
  triggerCreditVolume: number | null;
}): Promise<number> {
  const live = await computeTriggerCreditVolume(bounty.prizeRibbit);
  return Math.max(bounty.triggerCreditVolume ?? 0, live);
}

/**
 * Progress of an auto-bounty toward its trigger, for the public "reward fills
 * as you play" bar. Credit games measure credit-spend vs threshold; free
 * games are time-based (weekly, endsAt). Uses the same effective trigger the
 * settle path enforces, so the bar can never sit at 100% without paying.
 */
export async function bountyProgress(bounty: {
  game: string | null;
  autoPay: boolean;
  prizeRibbit: bigint;
  triggerCreditVolume: number | null;
  startsAt: Date;
  endsAt: Date;
}): Promise<
  | { mode: "credit"; spent: number; threshold: number; pct: number }
  | { mode: "time"; endsAt: Date }
  | null
> {
  if (!bounty.autoPay || !bounty.game) return null;
  if (!ARCADE_GAMES.has(bounty.game) && bounty.triggerCreditVolume) {
    const [spent, threshold] = await Promise.all([
      creditSpendForGame(bounty.game, bounty.startsAt),
      effectiveTriggerVolume(bounty),
    ]);
    return {
      mode: "credit",
      spent,
      threshold,
      pct: threshold > 0 ? Math.min(100, Math.round((spent / threshold) * 100)) : 0,
    };
  }
  return { mode: "time", endsAt: bounty.endsAt };
}

/**
 * Distribute a raw prize across entries in proportion to their value, summing
 * to exactly the prize (rounding dust to first place). Shared by the actual
 * payout AND the live projection so a player's shown estimate matches what
 * they'd be paid if the bounty triggered right now.
 */
export function proRataShares(prizeRaw: bigint, values: number[]): bigint[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => 0n);
  const shares = values.map(
    (v) => (prizeRaw * BigInt(Math.max(0, v))) / BigInt(total)
  );
  const dust = prizeRaw - shares.reduce((a, b) => a + b, 0n);
  if (shares.length > 0) shares[0] += dust;
  return shares;
}

/**
 * Current projected payout for a bounty at this instant — the ranked eligible
 * entries, each with the raw $RIBBIT they'd receive if it triggered now. The
 * estimate shifts as people play and only settles when the trigger fires. Uses
 * the full prize (the treasury-balance cap only applies at actual payout, and
 * the reserve normally covers it).
 */
export async function bountyStandings(bounty: {
  id: string;
  game: string | null;
  startsAt: Date;
  kind: string;
  prizeRibbit: bigint;
}): Promise<(RankedEntry & { projectedRaw: bigint })[]> {
  const ranked = await rankBountyEntries(bounty, 50);
  const shares = proRataShares(bounty.prizeRibbit, ranked.map((e) => e.value));
  return ranked.map((e, i) => ({ ...e, projectedRaw: shares[i] }));
}

export type AwardResult = {
  bountyId: string;
  paid: { rank: number; wallet: string; amountRaw: string }[];
  totalRaw: string;
};

/**
 * Pay a bounty's fixed prize pro-rata across ALL eligible winners, weighted by
 * performance (score / net credits). Atomic + idempotent (bounty→paid guard),
 * and hard-capped by the treasury's live balance when it's configured — never
 * pays out more $RIBBIT than the house actually holds. Queues withdrawals for
 * the off-server worker; never signs.
 */
export async function awardBountyProRata(bountyId: string): Promise<AwardResult | null> {
  const bounty = await prisma.bounty.findUnique({ where: { id: bountyId } });
  if (!bounty || bounty.status === "paid") return null;
  if (!bounty.game) return null;

  const ranked = await rankBountyEntries(bounty, 100);
  if (ranked.length === 0) return null;

  const totalValue = ranked.reduce((s, e) => s + Math.max(0, e.value), 0);
  if (totalValue <= 0) return null;

  // Cap the payout at the treasury's live balance (best-effort: only enforced
  // when the treasury is configured and readable).
  let prize = bounty.prizeRibbit;
  const treasury = await getTreasuryStats();
  if (treasury.configured && treasury.ribbitBalance !== null) {
    const balRaw = BigInt(Math.floor(treasury.ribbitBalance * 1_000_000));
    if (balRaw < prize) prize = balRaw;
  }
  if (prize <= 0n) return null;

  // Pro-rata shares — same math as the live projection players see.
  const shares = proRataShares(prize, ranked.map((e) => e.value));

  const result = await prisma.$transaction(
    async (tx) => {
      // Only OPEN bounties auto-pay. "Closed" is a definitive stop (admin
      // closed it early, or it expired unmet) — an admin can still award a
      // closed bounty explicitly via awardBounty, but the automat never will.
      const claimed = await tx.bounty.updateMany({
        where: { id: bountyId, status: "open" },
        data: { status: "paid", paidAt: new Date() },
      });
      if (claimed.count === 0) return null;

      const paid: { rank: number; wallet: string; amountRaw: string }[] = [];
      for (let i = 0; i < ranked.length; i++) {
        const e = ranked[i];
        const amountRaw = shares[i];
        if (amountRaw <= 0n) continue;
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
          amount: prize,
          asset: "RIBBIT",
          note: `Auto-bounty paid: ${bounty.title} (${paid.length} winner${paid.length === 1 ? "" : "s"})`,
          ref: bountyId,
        },
      });
      return {
        bountyId,
        paid,
        totalRaw: shares.reduce((a, b) => a + b, 0n).toString(),
      } satisfies AwardResult;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  return result;
}

/**
 * Roll a fresh weekly edition of an arcade bounty after the old one settles,
 * so "pays weekly" never depends on an admin remembering to repost. Skipped
 * when another open auto-pay bounty already covers the game (an admin may
 * have posted a special edition — never double the weekly cost silently).
 */
async function renewWeeklyBounty(b: {
  id: string;
  title: string;
  description: string;
  target: string | null;
  game: string | null;
  kind: string;
  prizeRibbit: bigint;
  prizeText: string | null;
}): Promise<void> {
  const otherOpen = await prisma.bounty.count({
    where: { game: b.game, status: "open", autoPay: true, id: { not: b.id } },
  });
  if (otherOpen > 0) return;
  await prisma.bounty.create({
    data: {
      title: b.title,
      description: b.description,
      target: b.target,
      game: b.game,
      kind: b.kind,
      prizeRibbit: b.prizeRibbit,
      prizeText: b.prizeText,
      autoPay: true,
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
}

/**
 * Lazily settle any auto-bounty whose trigger has fired: credit-game bounties
 * once credits wagered ≥ triggerCreditVolume; free-game bounties at endsAt
 * (then a fresh weekly edition is rolled automatically). Credit bounties that
 * reach their deadline with the meter unfilled close UNPAID — the admin can
 * extend, repost or award them manually. Called on reads like the bounties
 * list, mirroring lazy auction settlement. Gated by the bounty auto-pay
 * switch so nothing pays until the owner turns it on.
 */
export async function autoSettleBounties(): Promise<void> {
  if (!(await houseConfig()).bountyAutoPay) return;
  const now = new Date();
  const candidates = await prisma.bounty.findMany({
    where: { status: "open", autoPay: true, game: { not: null } },
  });
  for (const b of candidates) {
    try {
      if (b.game && ARCADE_GAMES.has(b.game)) {
        if (now < b.endsAt) continue; // free games: weekly / time-based
        const res = await awardBountyProRata(b.id);
        if (!res) {
          // Nobody eligible this week, or a concurrent caller settled it
          // first. The guarded close means exactly one caller renews.
          const closed = await prisma.bounty.updateMany({
            where: { id: b.id, status: "open" },
            data: { status: "closed" },
          });
          if (closed.count === 0) continue;
        }
        await renewWeeklyBounty(b);
      } else if (b.triggerCreditVolume) {
        const spent = await creditSpendForGame(b.game!, b.startsAt);
        // Live-effective trigger: an economy softened after posting can't
        // make an old bounty fire early and under-earn its prize.
        if (spent >= (await effectiveTriggerVolume(b))) {
          await awardBountyProRata(b.id);
        } else if (now >= b.endsAt) {
          await prisma.bounty.updateMany({
            where: { id: b.id, status: "open" },
            data: { status: "closed" },
          });
        }
      }
    } catch (e) {
      console.error(`auto-settle failed for bounty ${b.id}:`, e);
    }
  }
}

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
