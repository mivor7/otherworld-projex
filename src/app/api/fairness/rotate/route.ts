import { handler, ok, requireSession } from "@/lib/api";
import { rotateSeed } from "@/lib/fairness";

export const POST = handler(async () => {
  const session = await requireSession();
  const result = await rotateSeed(session.userId);
  return ok(result);
});
