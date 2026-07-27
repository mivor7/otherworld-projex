import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { CONFIG } from "@/lib/config";
import { houseConfig } from "@/lib/settings";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  // The money/activity stats count PLAYERS only: house-owned wallets
  // (CONFIG.houseWallets — owners buying credits from their own holdings,
  // or winning their own bounties) are excluded, because self-dealing isn't
  // revenue and counting it wildly overstated "house net". Burn totals stay
  // GLOBAL — a burn is on-chain destruction regardless of who signed it.
  const players = { user: { wallet: { notIn: CONFIG.houseWallets } } };
  const [chain, burnAgg, buyAgg, playerBuyAgg, takeAgg, roundCount, paidAgg, recent] =
    await Promise.all([
      getTreasuryStats(),
      prisma.burnEvent.aggregate({ _sum: { amountRaw: true }, _count: true }),
      prisma.creditPurchase.aggregate({
        _sum: { burnedRaw: true },
      }),
      prisma.creditPurchase.aggregate({
        where: players,
        _sum: { ribbitRaw: true, burnedRaw: true },
        _count: true,
      }),
      prisma.gameRound.aggregate({ where: players, _sum: { houseTake: true, wager: true } }),
      prisma.gameRound.count({ where: players }),
      prisma.bountyAward.aggregate({ where: players, _sum: { amountRaw: true } }),
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
      bountyPotShare: cfg.bountyPotShare,
      ribbitPerCredit: cfg.ribbitPerCredit,
    },
    totals: {
      // "Burned forever" = pure burns PLUS the burn leg of every credit
      // purchase (ALL wallets — burning is global, on-chain destruction).
      ribbitBurnedRaw:
        (burnAgg._sum.amountRaw ?? 0n) + (buyAgg._sum.burnedRaw ?? 0n),
      burnCount: burnAgg._count,
      creditsSoldRaw: playerBuyAgg._sum.ribbitRaw ?? 0n,
      purchaseCount: playerBuyAgg._count,
      bountyPaidRaw: paidAgg._sum.amountRaw ?? 0n,
      // REAL house money, in $RIBBIT, PLAYERS ONLY: the treasury leg of
      // player credit purchases (the burn leg is destroyed; burn-to-play
      // earns nothing) minus bounty prizes awarded to players. Can go
      // NEGATIVE — a seeded test phase pays out more than players put in.
      // Credits are chips that recycle through the tables, so a credits-
      // denominated "net" must never be presented as house profit.
      houseRevenueRaw:
        (playerBuyAgg._sum.ribbitRaw ?? 0n) - (playerBuyAgg._sum.burnedRaw ?? 0n),
      houseNetRaw:
        (playerBuyAgg._sum.ribbitRaw ?? 0n) -
        (playerBuyAgg._sum.burnedRaw ?? 0n) -
        (paidAgg._sum.amountRaw ?? 0n),
      houseTakeCredits: takeAgg._sum.houseTake ?? 0,
      wageredCredits: takeAgg._sum.wager ?? 0,
      rounds: roundCount,
    },
    recent,
  });
});
