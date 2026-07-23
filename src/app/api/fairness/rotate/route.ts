import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { rotateSeed } from "@/lib/fairness";
import { forceSettle } from "@/lib/blackjack";

// Rotation reveals the retired seed — a live blackjack deck derived from it
// would be fully exposed. Fresh open hands block rotation; abandoned ones
// (>10 min) are auto-stood so they settle fairly first.
export const POST = handler(async () => {
  const session = await requireSession();
  // Each rotation writes two seed rows — cap scripted spam (a verifying player
  // rotates once per session, not continuously).
  rateLimit(`rotate:${session.userId}`, 6, 60_000);

  const open = await prisma.gameRound.findMany({
    where: { userId: session.userId, settled: false },
    select: { id: true, createdAt: true },
  });
  for (const round of open) {
    if (Date.now() - round.createdAt.getTime() > 10 * 60 * 1000) {
      await forceSettle(session.userId, round.id);
    } else {
      return err("Finish your open blackjack hand before rotating your seed", 409);
    }
  }

  const result = await rotateSeed(session.userId);
  return ok(result);
});
