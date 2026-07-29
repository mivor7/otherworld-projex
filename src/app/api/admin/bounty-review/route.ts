// Payout review — the admin's pre-flight before paying a bounty: the top
// eligible entries for every open OR closed-unpaid leaderboard bounty, with
// each wallet's burn history, entry volume and account age so anomalies stand
// out before money moves. The ranking here is the SAME computation the award
// endpoint pays out (lib/bounty.rankBountyEntries) — the preview cannot
// disagree with the payout. Also returns recently-paid awards for the record.
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fromRaw } from "@/lib/config";
import { bountyPool } from "@/lib/ranked";
import { ARCADE_GAMES, rankBountyEntries } from "@/lib/bounty";

export const GET = handler(async () => {
  await requireAdmin();
  const bounties = await prisma.bounty.findMany({
    where: {
      status: { in: ["open", "closed"] },
      game: { not: null },
      kind: "leaderboard",
    },
    orderBy: [{ status: "asc" }, { endsAt: "asc" }],
  });

  const review = await Promise.all(
    bounties.map(async (b) => {
      const entries = await rankBountyEntries(b, 10);
      return {
        bounty: {
          id: b.id,
          title: b.title,
          target: b.target,
          game: b.game!,
          status: b.status,
          prize: b.prizeText ?? `${fromRaw(b.prizeRibbit).toLocaleString()} $RIBBIT`,
          prizeRibbit: fromRaw(b.prizeRibbit),
          endsAt: b.endsAt,
        },
        unit: ARCADE_GAMES.has(b.game!) ? "best score" : "net chips",
        verified: ARCADE_GAMES.has(b.game!),
        entries,
      };
    })
  );

  // Recently paid bounties, with their award breakdown.
  const paid = await prisma.bounty.findMany({
    where: { status: "paid" },
    orderBy: { paidAt: "desc" },
    take: 8,
    include: {
      awards: {
        orderBy: { rank: "asc" },
        include: { user: { select: { wallet: true } } },
      },
    },
  });
  const paidView = paid.map((b) => ({
    id: b.id,
    title: b.title,
    paidAt: b.paidAt,
    awards: b.awards.map((a) => ({
      rank: a.rank,
      wallet: a.user.wallet,
      amountRibbit: fromRaw(a.amountRaw),
      value: a.value,
    })),
  }));

  const pool = await bountyPool(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  return ok({ review, paid: paidView, pool });
});
