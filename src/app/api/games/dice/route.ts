import { handler, ok, requireSession } from "@/lib/api";
import { diceParams, playRound } from "@/lib/games";

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const params = diceParams.parse(await req.json());
  const result = await playRound(session.userId, "dice", params);
  return ok(result);
});
