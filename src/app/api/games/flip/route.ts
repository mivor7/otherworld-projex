import { handler, ok, requireSession } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { flipParams, playRound } from "@/lib/games";

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  // Generous per-user ceiling (a human tops out well under 1 round/sec) — the
  // wager debit is the real economic guard; this just caps scripted DB load.
  rateLimit(`round:${session.userId}`, 60, 60_000);
  const params = flipParams.parse(await req.json());
  const result = await playRound(session.userId, "flip", params);
  return ok(result);
});
