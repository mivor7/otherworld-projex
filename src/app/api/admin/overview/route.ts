import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";

export const GET = handler(async () => {
  await requireAdmin();
  const [
    applications,
    withdrawals,
    liveAuctions,
    openBounties,
    userCount,
    creditAgg,
    burnAgg,
    buyBurnAgg,
    lockedAgg,
    unfulfilled,
    treasury,
  ] = await Promise.all([
    prisma.listingApplication.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { wallet: true } } },
      take: 100,
    }),
    prisma.withdrawal.findMany({
      where: { status: { in: ["pending", "processing"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { wallet: true } } },
      take: 100,
    }),
    prisma.auction.count({ where: { status: "live" } }),
    prisma.bounty.count({ where: { status: "open" } }),
    prisma.user.count(),
    prisma.user.aggregate({ _sum: { credits: true } }),
    prisma.burnEvent.aggregate({ _sum: { amountRaw: true } }),
    prisma.creditPurchase.aggregate({ _sum: { burnedRaw: true } }),
    prisma.user.aggregate({ _sum: { ribbitLocked: true } }),
    // Settled lots not yet delivered — the fulfillment queue.
    prisma.auction.findMany({
      where: { status: "settled", fulfilled: false },
      orderBy: { endsAt: "desc" },
      include: { _count: { select: { bids: true } } },
      take: 100,
    }),
    getTreasuryStats(),
  ]);

  return ok({
    applications,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amountRaw: w.amountRaw,
      destination: w.destination,
      status: w.status,
      kind: w.kind,
      user: w.user,
    })),
    liveAuctions,
    openBounties,
    unfulfilled: unfulfilled.map((a) => ({
      id: a.id,
      title: a.title,
      currentRaw: a.currentRaw,
      winnerUserId: a.winnerUserId,
      bids: a._count.bids,
    })),
    stats: {
      users: userCount,
      creditsOutstanding: creditAgg._sum.credits ?? 0,
      // Pure burns + the burn leg of every credit purchase.
      lifetimeBurnedRaw: (
        (burnAgg._sum.amountRaw ?? 0n) + (buyBurnAgg._sum.burnedRaw ?? 0n)
      ).toString(),
      lockedRaw: (lockedAgg._sum.ribbitLocked ?? 0n).toString(),
      treasury,
    },
  });
});
