import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  // Unsettled rounds are excluded — a live blackjack hand's outcome blob
  // contains the dealer's hole card.
  const rounds = await prisma.gameRound.findMany({
    where: { userId: session.userId, settled: true },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { seed: { select: { seedHash: true, seed: true, active: true } } },
  });
  return ok(
    rounds.map((r) => ({
      id: r.id,
      game: r.game,
      nonce: r.nonce,
      clientSeed: r.clientSeed,
      params: JSON.parse(r.params),
      outcome: JSON.parse(r.outcome),
      wager: r.wager,
      payout: r.payout,
      seedHash: r.seed.seedHash,
      // Server seed only exposed after rotation (commit–reveal).
      serverSeed: r.seed.active ? null : r.seed.seed,
      createdAt: r.createdAt,
    }))
  );
});
