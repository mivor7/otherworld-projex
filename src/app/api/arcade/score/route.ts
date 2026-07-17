import { z } from "zod";
import { jwtVerify } from "jose";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONFIG, requireSessionSecret, toRaw } from "@/lib/config";
import { replay, seedFromToken } from "@/lib/worm-sim";

const body = z.object({
  runToken: z.string().min(10),
  score: z.number().int().min(0).max(1_000_000),
  // Input trace for replay-verified games (worm): the server re-simulates
  // the run and computes the score itself.
  trace: z
    .array(z.object({ s: z.number().int(), d: z.number().int() }))
    .max(20_000)
    .optional(),
});

// The live game's fastest step interval — used to prove a run took real
// wall-clock time: `steps × MIN_STEP_MS` can't exceed the token's age.
const WORM_MIN_STEP_MS = 70;

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { runToken, score, trace } = body.parse(await req.json());

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
  const game = String(payload.game ?? "hopper");

  // Per-wallet daily submission cap — bounds farming and keeps the boards
  // reviewable.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const today = await prisma.arcadeScore.count({
    where: { userId: session.userId, game, createdAt: { gte: dayStart } },
  });
  if (today >= CONFIG.arcadeDailySubmissions) {
    return err("Daily ranked-run limit reached — back tomorrow, hunter", 429);
  }

  const elapsedMs = Date.now() - Number(payload.startedAt);
  if (elapsedMs < 10_000) return err("Run too short to be real", 422);

  if (game === "worm") {
    // Replay-verified: the score is recomputed from the input trace. A
    // fabricated number can't pass; a bot-perfect trace still has to spend
    // real wall-time (steps × the game's fastest tick).
    if (!trace) return err("This game requires a replay trace", 422);
    const result = replay(trace, seedFromToken(runToken));
    if (!result.ok) return err(`Replay rejected: ${result.reason}`, 422);
    if (result.score !== score) {
      return err("Score does not match the replayed run", 422);
    }
    if (result.steps * WORM_MIN_STEP_MS > elapsedMs * 1.1) {
      return err("Run replayed faster than real time allows", 422);
    }
  } else {
    // Heuristic ceilings for the games without replay verification yet —
    // Frogris line clears score in hundreds, Hopper in single hops.
    const maxPerSec = game === "frogris" ? 150 : 30;
    if (score > Math.ceil((elapsedMs / 1000) * maxPerSec)) {
      return err("Score rejected", 422);
    }
  }

  try {
    await prisma.arcadeScore.create({
      data: { userId: session.userId, game, score, runToken },
    });
  } catch {
    return err("This run was already submitted", 409);
  }

  // Prize boards only rank burners — tell the player where they stand.
  const burned = await prisma.burnEvent.aggregate({
    where: { userId: session.userId },
    _sum: { amountRaw: true },
  });
  const ranked =
    (burned._sum.amountRaw ?? 0n) >= toRaw(CONFIG.rankedMinBurnedRibbit);
  return ok({ accepted: true, score, ranked, verified: game === "worm" });
});
