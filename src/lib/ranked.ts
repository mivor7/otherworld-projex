// Prize-board eligibility helpers — one source of truth for the
// skin-in-the-game rules:
//   1. lifetime $RIBBIT spent on credits ≥ RANKED_MIN_BURNED_RIBBIT, and
//   2. spend INSIDE the board window ≥ RANKED_MIN_WINDOW_BURNED_RIBBIT
// "Spend" counts BOTH pure burns AND credit purchases (a buyer is a spender —
// they burn part and pay the house the rest; both are skin in the game). Rule
// 2 is the anti-sybil multiplier: splitting play across N wallets costs N×
// fresh spend every window. Either threshold set to 0 disables that rule.
import { prisma } from "./db";
import { CONFIG, toRaw } from "./config";

/**
 * Total $RIBBIT a user has committed to credits (burns + buys), optionally
 * restricted to a window. Buys count their full amount — the whole payment is
 * real spend, regardless of the burn/house split.
 */
export async function burnTotals(
  userIds: string[],
  since?: Date
): Promise<Map<string, bigint>> {
  if (userIds.length === 0) return new Map();
  const whenBurn = since ? { createdAt: { gte: since } } : {};
  const [burns, buys] = await Promise.all([
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...whenBurn },
      _sum: { amountRaw: true },
    }),
    prisma.creditPurchase.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...whenBurn },
      _sum: { ribbitRaw: true },
    }),
  ]);
  const totals = new Map<string, bigint>();
  for (const b of burns) totals.set(b.userId, b._sum.amountRaw ?? 0n);
  for (const p of buys)
    totals.set(p.userId, (totals.get(p.userId) ?? 0n) + (p._sum.ribbitRaw ?? 0n));
  return totals;
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
