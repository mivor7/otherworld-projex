import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { CONFIG } from "@/lib/config";
import { houseConfig } from "@/lib/settings";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [chain, burnAgg, buyAgg, takeAgg, roundCount, paidAgg, recent] =
    await Promise.all([
      getTreasuryStats(),
      prisma.burnEvent.aggregate({ _sum: { amountRaw: true }, _count: true }),
      prisma.creditPurchase.aggregate({
        _sum: { ribbitRaw: true, burnedRaw: true },
        _count: true,
      }),
      prisma.gameRound.aggregate({ _sum: { houseTake: true, wager: true } }),
      prisma.gameRound.count(),
      prisma.bountyAward.aggregate({ _sum: { amountRaw: true } }),
      prisma.treasuryEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

  const cfg = await houseConfig();
  return ok({
    chain,
    ribbitMint: CONFIG.ribbitMint,
    houseEdge: cfg.houseEdge,
    // How the reward economy is parameterized — every credit purchase splits
    // between the burn and the treasury, and auto-bounty triggers are sized
    // from the prize so a pool that pays has already earned its keep.
    economy: {
      buyBurnShare: cfg.buyBurnShare,
      bountyHouseMargin: cfg.bountyHouseMargin,
      ribbitPerCredit: cfg.ribbitPerCredit,
    },
    totals: {
      // "Burned forever" = pure burns PLUS the burn leg of every credit
      // purchase — the split-buy path is where most burns actually happen.
      ribbitBurnedRaw:
        (burnAgg._sum.amountRaw ?? 0n) + (buyAgg._sum.burnedRaw ?? 0n),
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
