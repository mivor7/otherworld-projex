import { z } from "zod";
import { handler, ok, requireSession } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { act, currentRound, deal, dealParams, actParams } from "@/lib/blackjack";

const body = z.union([dealParams, actParams]);

export const GET = handler(async () => {
  const session = await requireSession();
  return ok({ round: await currentRound(session.userId) });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  // Higher ceiling than flip/dice — one hand is several actions (deal, hits,
  // stand/double). Still far above any human pace; caps scripted DB load.
  rateLimit(`round:${session.userId}`, 120, 60_000);
  const params = body.parse(await req.json());
  if (params.action === "deal") {
    return ok(await deal(session.userId, params.wager, params.clientSeed));
  }
  return ok(await act(session.userId, params.roundId, params.action));
});
