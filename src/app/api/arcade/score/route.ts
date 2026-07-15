import { z } from "zod";
import { jwtVerify } from "jose";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSessionSecret } from "@/lib/config";

const body = z.object({
  runToken: z.string().min(10),
  score: z.number().int().min(0).max(1_000_000),
});

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { runToken, score } = body.parse(await req.json());

  let payload: { uid?: unknown; game?: unknown; startedAt?: unknown };
  try {
    ({ payload } = await jwtVerify(
      runToken,
      new TextEncoder().encode(requireSessionSecret())
    ));
  } catch {
    return err("Invalid run token", 401);
  }
  if (payload.uid !== session.userId) return err("Run token mismatch", 403);

  const elapsedSec = (Date.now() - Number(payload.startedAt)) / 1000;
  if (elapsedSec < 10) return err("Run too short to be real", 422);
  // Generous per-second ceilings per game — Frogris line clears score in
  // hundreds, Hopper in single hops, Worm Frog in 10-point flies.
  const maxPerSec =
    payload.game === "frogris" ? 150 : payload.game === "worm" ? 20 : 30;
  if (score > Math.ceil(elapsedSec * maxPerSec)) return err("Score rejected", 422);

  try {
    await prisma.arcadeScore.create({
      data: {
        userId: session.userId,
        game: String(payload.game ?? "hopper"),
        score,
        runToken,
      },
    });
  } catch {
    return err("This run was already submitted", 409);
  }
  return ok({ accepted: true, score });
});
