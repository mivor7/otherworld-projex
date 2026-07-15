import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

function short(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const game = url.searchParams.get("game") ?? "hopper";
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 3600 * 1000);

  if (game === "hopper" || game === "frogris" || game === "worm") {
    // Best score per player within the window.
    const scores = await prisma.arcadeScore.groupBy({
      by: ["userId"],
      where: { game, createdAt: { gte: sinceDate } },
      _max: { score: true },
      orderBy: { _max: { score: "desc" } },
      take: 20,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: scores.map((s) => s.userId) } },
      select: { id: true, wallet: true },
    });
    const walletById = new Map(users.map((u) => [u.id, u.wallet]));
    return ok(
      scores.map((s, i) => ({
        rank: i + 1,
        player: short(walletById.get(s.userId) ?? "????????"),
        score: s._max.score,
      }))
    );
  }

  // Casino games: rank by net profit in the window.
  const rounds = await prisma.gameRound.groupBy({
    by: ["userId"],
    where: { game, createdAt: { gte: sinceDate } },
    _sum: { payout: true, wager: true },
    orderBy: { _sum: { payout: "desc" } },
    take: 100,
  });
  const ranked = rounds
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
