// Prize-board eligibility helpers — one source of truth for the
// skin-in-the-game rule (lifetime verified burns ≥ RANKED_MIN_BURNED_RIBBIT).
import { prisma } from "./db";
import { CONFIG, toRaw } from "./config";

/** Lifetime burned raw units per user, for the given users. */
export async function burnTotals(userIds: string[]): Promise<Map<string, bigint>> {
  if (userIds.length === 0) return new Map();
  const burns = await prisma.burnEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { amountRaw: true },
  });
  return new Map(burns.map((b) => [b.userId, b._sum.amountRaw ?? 0n]));
}

/**
 * Which of these users rank on prize boards. Threshold 0 disables the gate —
 * everyone ranks, including wallets with no burn rows.
 */
export async function eligibleBurners(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  if (CONFIG.rankedMinBurnedRibbit <= 0) return new Set(userIds);
  const threshold = toRaw(CONFIG.rankedMinBurnedRibbit);
  const totals = await burnTotals(userIds);
  return new Set(
    userIds.filter((id) => (totals.get(id) ?? 0n) >= threshold)
  );
}
