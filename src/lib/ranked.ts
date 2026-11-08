// Prize-board eligibility helpers — one source of truth for the
// skin-in-the-game rules:
//   1. lifetime $OWP deposited ≥ RANKED_MIN_BURNED_RIBBIT, and
//   2. deposits INSIDE the board window ≥ RANKED_MIN_WINDOW_BURNED_RIBBIT
// Rule 2 is the anti-sybil multiplier: splitting play across N wallets costs
// N× fresh deposits every window. Either threshold set to 0 disables that rule.
import { prisma } from "./db";
import { CONFIG, toRaw } from "./config";
import { houseConfig } from "./settings";

/**
 * Total $OWP a user has deposited to the treasury, optionally inside a window.
 * A deposit is the skin in the game: the tokens sit in the house wallet and
 * back the in-app balance.
 */
export async function burnTotals(
  userIds: string[],
  since?: Date
): Promise<Map<string, bigint>> {
  if (userIds.length === 0) return new Map();
  const when = since ? { createdAt: { gte: since } } : {};
  const deposits = await prisma.deposit.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, ...when },
    _sum: { amountRaw: true },
  });
  const totals = new Map<string, bigint>();
  for (const d of deposits) totals.set(d.userId, d._sum.amountRaw ?? 0n);
  return totals;
}

/**
 * Which of these users rank on prize boards for a window starting at
 * `windowStart`. Omitting the window skips the active-burner rule.
 * Callers that already hold the spend totals (the ranking computes them for
 * display anyway) can pass them via `pre` to skip re-running the groupBys.
 */
export async function eligibleBurners(
  userIds: string[],
  windowStart?: Date,
  pre?: { lifetime?: Map<string, bigint>; window?: Map<string, bigint> }
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const cfg = await houseConfig();
  let eligible = new Set(userIds);

  if (cfg.rankedMinBurnedRibbit > 0) {
    const threshold = toRaw(cfg.rankedMinBurnedRibbit);
    const totals = pre?.lifetime ?? (await burnTotals(userIds));
    eligible = new Set(
      [...eligible].filter((id) => (totals.get(id) ?? 0n) >= threshold)
    );
  }

  if (windowStart && cfg.rankedMinWindowBurnedRibbit > 0 && eligible.size > 0) {
    const threshold = toRaw(cfg.rankedMinWindowBurnedRibbit);
    // A precomputed window map may cover the full id set — a superset of the
    // survivors — which filters identically.
    const windowTotals =
      pre?.window ?? (await burnTotals([...eligible], windowStart));
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
