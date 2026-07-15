import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  const now = new Date();
  await prisma.bounty.updateMany({
    where: { status: "open", endsAt: { lte: now } },
    data: { status: "closed" },
  });
  const [open, closed] = await Promise.all([
    prisma.bounty.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" } }),
    prisma.bounty.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { endsAt: "desc" },
      take: 10,
    }),
  ]);
  return ok({ open, closed });
});
