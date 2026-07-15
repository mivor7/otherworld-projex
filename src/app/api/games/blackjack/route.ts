import { z } from "zod";
import { handler, ok, requireSession } from "@/lib/api";
import { act, currentRound, deal, dealParams, actParams } from "@/lib/blackjack";

const body = z.union([dealParams, actParams]);

export const GET = handler(async () => {
  const session = await requireSession();
  return ok({ round: await currentRound(session.userId) });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const params = body.parse(await req.json());
  if (params.action === "deal") {
    return ok(await deal(session.userId, params.wager, params.clientSeed));
  }
  return ok(await act(session.userId, params.roundId, params.action));
});
