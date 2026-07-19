// Issues a signed single-use run token before an arcade run, and records it
// in the run registry. Starting a run voids any previous unused run for the
// same (user, game): a wallet can only ever hold ONE live seed per game, so
// requesting many tokens and offline-simulating each seed to cherry-pick the
// luckiest run buys nothing.
import { z } from "zod";
import { SignJWT } from "jose";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSessionSecret } from "@/lib/config";
import { houseConfig } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ game: z.enum(["hopper", "frogris", "worm"]).default("hopper") });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  // New runs respect the emergency brake; in-flight runs may still submit.
  if ((await houseConfig()).gamesPaused) {
    return err("The arcade is paused — back shortly", 423);
  }
  // Light throttle: token-seeded PRNGs make seed-shopping mostly pointless,
  // but hammering starts to fish for a lucky frogris bag / hopper traffic
  // pattern shouldn't be free either.
  rateLimit(`arcade-start:${session.userId}`, 30, 60_000);
  const { game } = body.parse(await req.json().catch(() => ({})));

  const jti = crypto.randomUUID();
  const startedAt = Date.now();
  await prisma.$transaction([
    prisma.arcadeRun.updateMany({
      where: { userId: session.userId, game, usedAt: null, voidedAt: null },
      data: { voidedAt: new Date() },
    }),
    prisma.arcadeRun.create({ data: { id: jti, userId: session.userId, game } }),
  ]);

  const runToken = await new SignJWT({
    uid: session.userId,
    game,
    startedAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(requireSessionSecret()));
  return ok({ runToken });
});
