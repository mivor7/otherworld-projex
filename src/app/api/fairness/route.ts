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
  // Rounds played under an ALREADY-REVEALED seed — safe to hand back with the
  // seed so the browser can recompute and confirm each result. Active-seed
  // rounds are never included (their seed is still committed/secret).
  const roundRows = await prisma.gameRound.findMany({
    where: { userId: session.userId, settled: true, seed: { active: false } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      game: true,
      nonce: true,
      clientSeed: true,
      outcome: true,
      wager: true,
      payout: true,
      createdAt: true,
      seed: { select: { seed: true, seedHash: true } },
    },
  });
  return ok({
    activeHash: active.seedHash,
    nextNonce: active.nonce,
    revealed,
    rounds: roundRows.map((r) => ({
      id: r.id,
      game: r.game,
      nonce: r.nonce,
      clientSeed: r.clientSeed,
      seed: r.seed.seed,
      seedHash: r.seed.seedHash,
      outcome: r.outcome,
      wager: r.wager,
      payout: r.payout,
      createdAt: r.createdAt,
    })),
  });
});
