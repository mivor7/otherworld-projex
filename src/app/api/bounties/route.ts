import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bountyPool } from "@/lib/ranked";

export const GET = handler(async () => {
  const now = new Date();
  await prisma.bounty.updateMany({
    where: { status: "open", endsAt: { lte: now } },
    data: { status: "closed" },
  });
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
  return ok({ open, closed, pool });
});
