import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { rotateSeed, SeedInUseError } from "@/lib/fairness";
import { forceSettle } from "@/lib/blackjack";

// Rotation reveals the retired seed — a live blackjack deck derived from it
// would be fully exposed. Fresh open hands block rotation; abandoned ones
// (>10 min) are auto-stood so they settle fairly first.
const OPEN_HAND = "Finish your open blackjack hand before rotating your seed";

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
      return err(OPEN_HAND, 409);
    }
  }

  // The check above is a courtesy (and settles abandoned hands). The real
  // guard is inside rotateSeed: it refuses to reveal a seed while any round
  // dealt from it is open, including one dealt while this request was running.
  try {
    return ok(await rotateSeed(session.userId));
  } catch (e) {
    if (e instanceof SeedInUseError) return err(OPEN_HAND, 409);
    throw e;
  }
});
