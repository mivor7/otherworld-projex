import { handler, ok, requireSession } from "@/lib/api";
import { plinkoParams, playRound } from "@/lib/games";

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const params = plinkoParams.parse(await req.json());
  const result = await playRound(session.userId, "plinko", params);
  return ok(result);
});
