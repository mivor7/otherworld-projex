import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  await requireAdmin();
  const [applications, withdrawals, liveAuctions, openBounties] = await Promise.all([
    prisma.listingApplication.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { wallet: true } } },
    }),
    prisma.withdrawal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { wallet: true } } },
    }),
    prisma.auction.count({ where: { status: "live" } }),
    prisma.bounty.count({ where: { status: "open" } }),
  ]);
  return ok({ applications, withdrawals, liveAuctions, openBounties });
});
