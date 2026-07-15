import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { CONFIG } from "@/lib/config";

export const GET = handler(async () => {
  const [chain, burnAgg, takeAgg, roundCount, recent] = await Promise.all([
    getTreasuryStats(),
    prisma.burnEvent.aggregate({ _sum: { amountRaw: true }, _count: true }),
    prisma.gameRound.aggregate({ _sum: { houseTake: true, wager: true } }),
    prisma.gameRound.count(),
    prisma.treasuryEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  return ok({
    chain,
    ribbitMint: CONFIG.ribbitMint,
    houseEdge: CONFIG.houseEdge,
    houseSplit: CONFIG.houseSplit,
    totals: {
      ribbitBurnedRaw: burnAgg._sum.amountRaw ?? 0n,
      burnCount: burnAgg._count,
      houseTakeCredits: takeAgg._sum.houseTake ?? 0,
      wageredCredits: takeAgg._sum.wager ?? 0,
      rounds: roundCount,
    },
    recent,
  });
});
