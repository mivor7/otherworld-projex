// Prize-board eligibility helpers — one source of truth for the
// skin-in-the-game rules:
//   1. lifetime verified burns ≥ RANKED_MIN_BURNED_RIBBIT, and
//   2. burns INSIDE the board window ≥ RANKED_MIN_WINDOW_BURNED_RIBBIT
// Rule 2 is the anti-sybil multiplier: splitting play across N wallets costs
// N× fresh burns every single window, not one historical burn per wallet.
// Either threshold set to 0 disables that rule.
import { prisma } from "./db";
import { CONFIG, toRaw } from "./config";

/** Burned raw units per user, optionally restricted to a window. */
export async function burnTotals(
  userIds: string[],
  since?: Date
): Promise<Map<string, bigint>> {
  if (userIds.length === 0) return new Map();
  const burns = await prisma.burnEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { amountRaw: true },
  });
  return new Map(burns.map((b) => [b.userId, b._sum.amountRaw ?? 0n]));
}

/**
 * Which of these users rank on prize boards for a window starting at
 * `windowStart`. Omitting the window skips the active-burner rule.
 */
export async function eligibleBurners(
  userIds: string[],
  windowStart?: Date
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  let eligible = new Set(userIds);

  if (CONFIG.rankedMinBurnedRibbit > 0) {
    const threshold = toRaw(CONFIG.rankedMinBurnedRibbit);
    const totals = await burnTotals(userIds);
    eligible = new Set(
      [...eligible].filter((id) => (totals.get(id) ?? 0n) >= threshold)
    );
  }

  if (windowStart && CONFIG.rankedMinWindowBurnedRibbit > 0 && eligible.size > 0) {
    const threshold = toRaw(CONFIG.rankedMinWindowBurnedRibbit);
    const windowTotals = await burnTotals([...eligible], windowStart);
    eligible = new Set(
      [...eligible].filter((id) => (windowTotals.get(id) ?? 0n) >= threshold)
    );
  }

  return eligible;
}

/**
 * The sustainable weekly bounty pool: BOUNTY_POOL_SHARE of the house take
 * actually realized in the window. Prizes scale with revenue — they can
 * never be promised out of thin air.
 */
export async function bountyPool(since: Date): Promise<{
  houseTakeCredits: number;
  poolCredits: number;
  share: number;
}> {
  const take = await prisma.gameRound.aggregate({
    where: { settled: true, createdAt: { gte: since } },
    _sum: { houseTake: true },
  });
  const houseTakeCredits = Math.max(0, take._sum.houseTake ?? 0);
  return {
    houseTakeCredits,
    poolCredits: Math.floor(houseTakeCredits * CONFIG.bountyPoolShare),
    share: CONFIG.bountyPoolShare,
  };
}
