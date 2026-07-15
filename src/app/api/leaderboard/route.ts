import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONFIG, toRaw } from "@/lib/config";

function short(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

/**
 * Sybil deterrence: prize boards only rank wallets with skin in the game —
 * lifetime verified burns ≥ RANKED_MIN_BURNED_RIBBIT. Everyone can play;
 * only burners compete for the pools. Eligibility is evaluated at read time,
 * so burning mid-week retroactively ranks the week's best score.
 */
async function eligibleBurners(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  // Threshold 0 disables the gate — everyone ranks (wallets without any
  // burn rows included).
  if (CONFIG.rankedMinBurnedRibbit <= 0) return new Set(userIds);
  const threshold = toRaw(CONFIG.rankedMinBurnedRibbit);
  const burns = await prisma.burnEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { amountRaw: true },
  });
  return new Set(
    burns
      .filter((b) => (b._sum.amountRaw ?? 0n) >= threshold)
      .map((b) => b.userId)
  );
}

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const game = url.searchParams.get("game") ?? "hopper";
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 3600 * 1000);

  if (game === "hopper" || game === "frogris" || game === "worm") {
    // Best score per player within the window, ranked burners only.
    const scores = await prisma.arcadeScore.groupBy({
      by: ["userId"],
      where: { game, createdAt: { gte: sinceDate } },
      _max: { score: true },
      orderBy: { _max: { score: "desc" } },
      take: 60,
    });
    const eligible = await eligibleBurners(scores.map((s) => s.userId));
    const ranked = scores.filter((s) => eligible.has(s.userId)).slice(0, 20);
    const users = await prisma.user.findMany({
      where: { id: { in: ranked.map((s) => s.userId) } },
      select: { id: true, wallet: true },
    });
    const walletById = new Map(users.map((u) => [u.id, u.wallet]));
    return ok(
      ranked.map((s, i) => ({
        rank: i + 1,
        player: short(walletById.get(s.userId) ?? "????????"),
        score: s._max.score,
      }))
    );
  }

  // Table games: rank by net profit; require in-window volume + burner
  // eligibility.
  const rounds = await prisma.gameRound.groupBy({
    by: ["userId"],
    where: { game, createdAt: { gte: sinceDate }, settled: true },
    _sum: { payout: true, wager: true },
    orderBy: { _sum: { payout: "desc" } },
    take: 200,
  });
  const qualified = rounds.filter(
    (r) => (r._sum.wager ?? 0) >= CONFIG.rankedMinTableVolume
  );
  const eligible = await eligibleBurners(qualified.map((r) => r.userId));
  const ranked = qualified
    .filter((r) => eligible.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      net: (r._sum.payout ?? 0) - (r._sum.wager ?? 0),
      volume: r._sum.wager ?? 0,
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 20);
  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map((r) => r.userId) } },
    select: { id: true, wallet: true },
  });
  const walletById = new Map(users.map((u) => [u.id, u.wallet]));
  return ok(
    ranked.map((r, i) => ({
      rank: i + 1,
      player: short(walletById.get(r.userId) ?? "????????"),
      score: r.net,
      volume: r.volume,
    }))
  );
});
