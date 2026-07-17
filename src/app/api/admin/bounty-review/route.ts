// Payout review — the admin's pre-flight before paying a bounty pool: the
// top entries for every open leaderboard bounty, with each wallet's lifetime
// burn, entry volume and account age, so anomalies stand out before money
// moves. Ranked (burn-gated) entries only, same rule as the public boards.
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONFIG, fromRaw } from "@/lib/config";
import { burnTotals, eligibleBurners } from "@/lib/ranked";

const ARCADE = new Set(["hopper", "frogris", "worm"]);

export const GET = handler(async () => {
  await requireAdmin();
  const bounties = await prisma.bounty.findMany({
    where: { status: "open", game: { not: null }, kind: "leaderboard" },
    orderBy: { endsAt: "asc" },
  });

  const review = [];
  for (const b of bounties) {
    const game = b.game!;
    let rows: { userId: string; value: number; entries: number; volume?: number }[];

    if (ARCADE.has(game)) {
      const scores = await prisma.arcadeScore.groupBy({
        by: ["userId"],
        where: { game, createdAt: { gte: b.startsAt } },
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
        where: { game, settled: true, createdAt: { gte: b.startsAt } },
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
    const [eligible, burns, users] = await Promise.all([
      eligibleBurners(ids),
      burnTotals(ids),
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, wallet: true, createdAt: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));

    const entries = rows
      .filter((r) => eligible.has(r.userId))
      .filter((r) =>
        ARCADE.has(game) ? true : (r.volume ?? 0) >= CONFIG.rankedMinTableVolume
      )
      .slice(0, 10)
      .map((r, i) => {
        const u = userById.get(r.userId);
        return {
          rank: i + 1,
          wallet: u?.wallet ?? "?",
          value: r.value,
          entries: r.entries,
          volume: r.volume,
          burnedRibbit: Math.round(fromRaw(burns.get(r.userId) ?? 0n)),
          walletAgeDays: u
            ? Math.floor((Date.now() - u.createdAt.getTime()) / 86_400_000)
            : 0,
        };
      });

    review.push({
      bounty: {
        id: b.id,
        title: b.title,
        target: b.target,
        game,
        prize: b.prizeText ?? `${fromRaw(b.prizeRibbit).toLocaleString()} $RIBBIT`,
        endsAt: b.endsAt,
      },
      unit: ARCADE.has(game) ? "best score" : "net credits",
      verified: game === "worm",
      entries,
    });
  }

  return ok(review);
});
