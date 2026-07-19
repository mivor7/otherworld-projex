// A player's own bounty winnings — every prize they've been awarded, with the
// live payout status pulled from the linked withdrawal. This is the durable
// receipt: once a bounty settles its live projection is gone, but the winner
// can always see here exactly how much they won and whether it's on its way.
import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";

// Live data — never cache; payout status changes as the worker sends prizes.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  const awards = await prisma.bountyAward.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { bounty: { select: { title: true, game: true } } },
  });

  // Join each award to its queued/sent payout (withdrawalId is a loose FK, so
  // fetch the linked withdrawals in one query and map by id).
  const wdIds = awards
    .map((a) => a.withdrawalId)
    .filter((id): id is string => !!id);
  const wds = wdIds.length
    ? await prisma.withdrawal.findMany({
        where: { id: { in: wdIds } },
        select: { id: true, status: true, signature: true },
      })
    : [];
  const wdById = new Map(wds.map((w) => [w.id, w]));

  return ok(
    awards.map((a) => {
      const wd = a.withdrawalId ? wdById.get(a.withdrawalId) : null;
      return {
        id: a.id,
        title: a.bounty.title,
        game: a.bounty.game,
        rank: a.rank,
        amountRaw: a.amountRaw.toString(),
        createdAt: a.createdAt,
        // No linked withdrawal yet → treat as pending (payout not queued).
        status: wd?.status ?? "pending",
        signature: wd?.signature ?? null,
      };
    })
  );
});
