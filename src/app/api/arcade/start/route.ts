// Issues a signed single-use run token before an arcade run. Scores are only
// accepted with a valid token, a plausible elapsed time, and a sane score —
// basic but effective anti-cheat for a leaderboard with prizes.
import { z } from "zod";
import { SignJWT } from "jose";
import { handler, ok, requireSession } from "@/lib/api";
import { requireSessionSecret } from "@/lib/config";

const body = z.object({ game: z.enum(["hopper", "frogris", "worm"]).default("hopper") });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { game } = body.parse(await req.json().catch(() => ({})));
  const runToken = await new SignJWT({
    uid: session.userId,
    game,
    startedAt: Date.now(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(requireSessionSecret()));
  return ok({ runToken });
});
