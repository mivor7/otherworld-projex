import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { settleDueAuctions } from "@/lib/auctions";

export const GET = handler(async () => {
  await settleDueAuctions();
  const [live, past] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "live" },
      orderBy: { endsAt: "asc" },
      include: { _count: { select: { bids: true } } },
    }),
    prisma.auction.findMany({
      where: { status: { in: ["settled", "cancelled"] } },
      orderBy: { endsAt: "desc" },
      take: 12,
      include: { _count: { select: { bids: true } } },
    }),
  ]);
  return ok({ live, past });
});
