import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bountyPool } from "@/lib/ranked";
import { autoSettleBounties, bountyProgress } from "@/lib/bounty";

export const GET = handler(async () => {
  const now = new Date();
  // Non-auto bounties simply close at their deadline; auto bounties settle
  // themselves when their trigger fires (lazy, like auction settlement).
  await prisma.bounty.updateMany({
    where: { status: "open", autoPay: false, endsAt: { lte: now } },
    data: { status: "closed" },
  });
  await autoSettleBounties();

  const weekStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [open, closed, pool] = await Promise.all([
    prisma.bounty.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" } }),
    prisma.bounty.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { endsAt: "desc" },
      take: 10,
    }),
    bountyPool(weekStart),
  ]);

  // Per-bounty progress toward the auto-payout trigger — so players watch the
  // reward fill as the game gets played.
  const openWithProgress = await Promise.all(
    open.map(async (b) => ({ ...b, progress: await bountyProgress(b) }))
  );

  return ok({ open: openWithProgress, closed, pool });
});
