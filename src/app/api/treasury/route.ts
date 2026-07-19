import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { CONFIG } from "@/lib/config";

export const GET = handler(async () => {
  const [chain, burnAgg, buyAgg, takeAgg, roundCount, paidAgg, recent] =
    await Promise.all([
      getTreasuryStats(),
      prisma.burnEvent.aggregate({ _sum: { amountRaw: true }, _count: true }),
      prisma.creditPurchase.aggregate({ _sum: { ribbitRaw: true }, _count: true }),
      prisma.gameRound.aggregate({ _sum: { houseTake: true, wager: true } }),
      prisma.gameRound.count(),
      prisma.bountyAward.aggregate({ _sum: { amountRaw: true } }),
      prisma.treasuryEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

  return ok({
    chain,
    ribbitMint: CONFIG.ribbitMint,
    houseEdge: CONFIG.houseEdge,
    // How the reward economy is parameterized — every credit purchase splits
    // between the burn and the treasury, and auto-bounty triggers are sized
    // from the prize so a pool that pays has already earned its keep.
    economy: {
      buyBurnShare: CONFIG.buyBurnShare,
      bountyHouseMargin: CONFIG.bountyHouseMargin,
      ribbitPerCredit: CONFIG.ribbitPerCredit,
    },
    totals: {
      ribbitBurnedRaw: burnAgg._sum.amountRaw ?? 0n,
      burnCount: burnAgg._count,
      creditsSoldRaw: buyAgg._sum.ribbitRaw ?? 0n,
      purchaseCount: buyAgg._count,
      bountyPaidRaw: paidAgg._sum.amountRaw ?? 0n,
      houseTakeCredits: takeAgg._sum.houseTake ?? 0,
      wageredCredits: takeAgg._sum.wager ?? 0,
      rounds: roundCount,
    },
    recent,
  });
});
