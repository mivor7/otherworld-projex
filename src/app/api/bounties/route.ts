import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { autoSettleBounties, bountyProgress } from "@/lib/bounty";

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

  const [open, closed, paidAgg] = await Promise.all([
    prisma.bounty.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" }, take: 100 }),
    prisma.bounty.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { endsAt: "desc" },
      take: 10,
    }),
    prisma.bountyAward.aggregate({ _sum: { amountRaw: true } }),
  ]);

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
