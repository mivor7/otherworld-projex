import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ARCADE_GAMES, autoSettleBounties, bountyProgress } from "@/lib/bounty";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const now = new Date();
  // Non-auto bounties simply close at their deadline; auto bounties settle
  // themselves when their trigger fires (lazy, like auction settlement).
  await prisma.bounty.updateMany({
    where: { status: "open", autoPay: false, endsAt: { lte: now } },
    data: { status: "closed" },
  });
  await autoSettleBounties();

  const [openRaw, closed, paidAgg] = await Promise.all([
    prisma.bounty.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" }, take: 100 }),
    prisma.bounty.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { endsAt: "desc" },
      take: 10,
    }),
    prisma.bountyAward.aggregate({ _sum: { amountRaw: true } }),
  ]);

  // Credit-required games (real prizes, spend-gated) rank above the free
  // arcade games (weekly), then bigger prizes first within each group.
  const isFree = (g: string | null) => !!g && ARCADE_GAMES.has(g);
  const open = [...openRaw].sort((a, b) => {
    const af = isFree(a.game) ? 1 : 0;
    const bf = isFree(b.game) ? 1 : 0;
    if (af !== bf) return af - bf; // credit games (0) before free (1)
    return b.prizeRibbit > a.prizeRibbit ? 1 : b.prizeRibbit < a.prizeRibbit ? -1 : 0;
  });

  // Per-bounty progress toward the auto-payout trigger — so players watch the
  // reward fill as the game gets played.
  const openWithProgress = await Promise.all(
    open.map(async (b) => ({ ...b, progress: await bountyProgress(b) }))
  );

  // Board headline numbers: fixed prizes currently on the board + everything
  // the house has actually paid hunters to date.
  const totals = {
    openPrizeRaw: open.reduce((s, b) => s + b.prizeRibbit, 0n),
    paidOutRaw: paidAgg._sum.amountRaw ?? 0n,
  };

  return ok({ open: openWithProgress, closed, totals });
});
