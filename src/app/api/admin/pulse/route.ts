// Operator's live pulse — who's active and, critically, who's UP on the house.
// Derived live (no extra state). Two jobs:
//   1. Health at a glance: active players (24h/7d), new signups, today's play.
//   2. Treasury watch: the biggest table players by volume, with net P&L, so a
//      hunter consistently beating the house surfaces here instead of quietly
//      draining the treasury. Actions (ban / adjust) already live in the player
//      lookup — this just tells the operator WHO to look at.
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fromRaw } from "@/lib/config";

// Live data — never cache; the whole point is a current read.
export const dynamic = "force-dynamic";

const H = 3600 * 1000;

export const GET = handler(async () => {
  await requireAdmin();
  const now = Date.now();
  const d1 = new Date(now - 24 * H);
  const d7 = new Date(now - 7 * 24 * H);

  const [
    roundUsers1,
    roundUsers7,
    scoreUsers1,
    scoreUsers7,
    newUsers24,
    newUsers7d,
    roundStats1,
    burn1,
    buy1,
    top,
  ] = await Promise.all([
    prisma.gameRound.groupBy({ by: ["userId"], where: { createdAt: { gte: d1 } } }),
    prisma.gameRound.groupBy({ by: ["userId"], where: { createdAt: { gte: d7 } } }),
    prisma.arcadeScore.groupBy({ by: ["userId"], where: { createdAt: { gte: d1 } } }),
    prisma.arcadeScore.groupBy({ by: ["userId"], where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d1 } } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.gameRound.aggregate({
      where: { settled: true, createdAt: { gte: d1 } },
      _count: true,
      _sum: { wager: true },
    }),
    prisma.burnEvent.aggregate({ where: { createdAt: { gte: d1 } }, _sum: { amountRaw: true } }),
    prisma.creditPurchase.aggregate({ where: { createdAt: { gte: d1 } }, _sum: { ribbitRaw: true } }),
    // Treasury watch — biggest table players over 7d, net computed below.
    prisma.gameRound.groupBy({
      by: ["userId"],
      where: { settled: true, createdAt: { gte: d7 } },
      _sum: { wager: true, payout: true },
      _count: true,
      orderBy: { _sum: { wager: "desc" } },
      take: 15,
    }),
  ]);

  const activeCount = (a: { userId: string }[], b: { userId: string }[]) =>
    new Set([...a.map((x) => x.userId), ...b.map((x) => x.userId)]).size;

  const ids = top.map((t) => t.userId);
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, wallet: true } })
    : [];
  const walletById = new Map(users.map((u) => [u.id, u.wallet]));

  const topPlayers = top.map((t) => {
    const volume = t._sum.wager ?? 0;
    return {
      wallet: walletById.get(t.userId) ?? "?",
      rounds: t._count,
      volume,
      net: (t._sum.payout ?? 0) - volume, // + means up on the house
    };
  });

  return ok({
    active24: activeCount(roundUsers1, scoreUsers1),
    active7d: activeCount(roundUsers7, scoreUsers7),
    newUsers24,
    newUsers7d,
    rounds24: roundStats1._count,
    wagered24: roundStats1._sum.wager ?? 0,
    ribbitIn24: Math.round(fromRaw((burn1._sum.amountRaw ?? 0n) + (buy1._sum.ribbitRaw ?? 0n))),
    topPlayers,
  });
});
