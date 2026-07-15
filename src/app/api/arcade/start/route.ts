// Issues a signed single-use run token before an arcade run. Scores are only
// accepted with a valid token, a plausible elapsed time, and a sane score —
// basic but effective anti-cheat for a leaderboard with prizes.
import { SignJWT } from "jose";
import { handler, ok, requireSession } from "@/lib/api";
import { requireSessionSecret } from "@/lib/config";

export const POST = handler(async () => {
  const session = await requireSession();
  const runToken = await new SignJWT({
    uid: session.userId,
    game: "hopper",
    startedAt: Date.now(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(requireSessionSecret()));
  return ok({ runToken });
});
