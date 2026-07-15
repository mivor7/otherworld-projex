import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  const session = await requireSession();
  const bids = await prisma.bid.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      auction: {
        select: { id: true, title: true, status: true, endsAt: true, currentRaw: true },
      },
    },
  });
  return ok(
    bids.map((b) => ({
      id: b.id,
      amountRaw: b.amountRaw,
      status: b.status, // active | outbid | won
      createdAt: b.createdAt,
      auction: b.auction,
    }))
  );
});
