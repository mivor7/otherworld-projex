import { handler, ok, requireSession } from "@/lib/api";
import { flipParams, playRound } from "@/lib/games";

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const params = flipParams.parse(await req.json());
  const result = await playRound(session.userId, "flip", params);
  return ok(result);
});
