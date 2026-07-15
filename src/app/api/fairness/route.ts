import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getActiveSeed } from "@/lib/fairness";

export const GET = handler(async () => {
  const session = await requireSession();
  const active = await getActiveSeed(session.userId);
  const revealed = await prisma.serverSeed.findMany({
    where: { userId: session.userId, active: false },
    orderBy: { revealedAt: "desc" },
    take: 10,
    select: { seed: true, seedHash: true, nonce: true, revealedAt: true },
  });
  return ok({
    activeHash: active.seedHash,
    nextNonce: active.nonce,
    revealed,
  });
});
