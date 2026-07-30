// Earned badges, computed live from the ledger — no extra state to maintain.
import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { burnTotals } from "@/lib/ranked";
import { houseConfig } from "@/lib/settings";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  const userId = session.userId;

  const [rounds, maxPayout, bj, spendTotals, arcadeBest, auctionsWon, cfg] =
    await Promise.all([
      prisma.gameRound.count({ where: { userId, settled: true } }),
      prisma.gameRound.aggregate({ where: { userId }, _max: { payout: true } }),
      prisma.gameRound.aggregate({
        where: { userId, game: "blackjack", settled: true },
        _sum: { payout: true, wager: true },
      }),
      burnTotals([userId]), // burns + buys — same spend rule the boards use
      prisma.arcadeScore.aggregate({ where: { userId }, _max: { score: true } }),
      prisma.auction.count({ where: { winnerUserId: userId } }),
      houseConfig(),
    ]);
  const spentRaw = spendTotals.get(userId) ?? 0n;

  const bjNet = (bj._sum.payout ?? 0) - (bj._sum.wager ?? 0);
  const badges = [
    {
      id: "first-blood",
      icon: "🩸",
      name: "First Blood",
      desc: "Settle your first round",
      earned: rounds >= 1,
    },
    {
      id: "exterminator",
      icon: "🎯",
      name: "Exterminator",
      desc: "Score 300+ in any arcade episode",
      earned: (arcadeBest._max.score ?? 0) >= 300,
    },
    {
      id: "card-shark",
      icon: "🃏",
      name: "Card Shark",
      desc: "Finish +100 chips net at blackjack",
      earned: bjNet >= 100,
    },
    {
      id: "high-roller",
      icon: "💰",
      name: "High Roller",
      desc: "Bank a single payout of 100+ chips",
      earned: (maxPayout._max.payout ?? 0) >= 100,
    },
    {
      id: "skin-in-the-game",
      icon: "🎖️",
      name: "Ranked Hunter",
      desc: `Spend ${cfg.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT on credits lifetime — unlocks prize boards`,
      earned: spentRaw >= toRaw(cfg.rankedMinBurnedRibbit),
    },
    {
      id: "torch-bearer",
      icon: "🔥",
      name: "Torch Bearer",
      desc: "Spend 10,000+ $RIBBIT on chips",
      earned: spentRaw >= toRaw(10_000),
    },
    {
      id: "gavel-hand",
      icon: "🔨",
      name: "Gavel Hand",
      desc: "Win a lot in the auction house",
      earned: auctionsWon >= 1,
    },
    {
      id: "the-regular",
      icon: "🐸",
      name: "The Regular",
      desc: "Settle 50 rounds at the tables",
      earned: rounds >= 50,
    },
  ];

  return ok(badges);
});
