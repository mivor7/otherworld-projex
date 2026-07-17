import { z } from "zod";
import { jwtVerify } from "jose";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONFIG, requireSessionSecret } from "@/lib/config";
import { replay as replayWorm, seedFromToken } from "@/lib/worm-sim";
import { replayFrogris, FRAME_MS } from "@/lib/frogris-sim";
import { replayHopper } from "@/lib/hopper-sim";
import { eligibleBurners } from "@/lib/ranked";

const body = z.object({
  runToken: z.string().min(10),
  score: z.number().int().min(0).max(1_000_000),
  // Input trace for the replay: every arcade game is re-simulated on the
  // server, which computes the score itself. Item shape is game-specific
  // (worm {s,d}, frogris {f,a}, hopper {f,d}); each sim strictly validates
  // its own trace.
  trace: z
    .array(z.record(z.string().max(1), z.number().int().min(0).max(10_000_000)))
    .max(20_000)
    .optional(),
});

// The worm's fastest step interval — proves a run took real wall-clock time.
const WORM_MIN_STEP_MS = 70;

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { runToken, score, trace } = body.parse(await req.json());

  let payload: { uid?: unknown; game?: unknown; startedAt?: unknown; jti?: string };
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
  const jti = String(payload.jti ?? "");

  // Run registry: the token must be one we issued, unconsumed, and not
  // superseded — starting a new run voids the previous one, so a wallet can
  // never hold multiple live seeds to cherry-pick from.
  const run = await prisma.arcadeRun.findUnique({ where: { id: jti } });
  if (!run || run.userId !== session.userId || run.game !== game) {
    return err("Unknown run — start a fresh one", 401);
  }
  if (run.voidedAt) return err("A newer run was started — this one is void", 409);
  if (run.usedAt) return err("This run was already submitted", 409);

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

  // Replay-verified scoring for every episode: the score is recomputed from
  // the input trace, and the run must have consumed real wall-time. A
  // fabricated number can't pass; a bot-perfect trace still has to wait out
  // the game's own clock.
  if (!trace) return err("This game requires a replay trace", 422);
  const seed = seedFromToken(runToken);
  let replayedScore: number;
  let simMs: number;
  if (game === "worm") {
    const result = replayWorm(trace as { s: number; d: number }[], seed);
    if (!result.ok) return err(`Replay rejected: ${result.reason}`, 422);
    replayedScore = result.score;
    simMs = result.steps * WORM_MIN_STEP_MS;
  } else if (game === "frogris") {
    const result = replayFrogris(trace as { f: number; a: number }[], seed);
    if (!result.ok) return err(`Replay rejected: ${result.reason}`, 422);
    replayedScore = result.score;
    simMs = result.frames * FRAME_MS;
  } else if (game === "hopper") {
    const result = replayHopper(trace as { f: number; d: number }[], seed);
    if (!result.ok) return err(`Replay rejected: ${result.reason}`, 422);
    replayedScore = result.score;
    simMs = result.frames * FRAME_MS;
  } else {
    return err("Unknown game", 422);
  }
  if (replayedScore !== score) {
    return err("Score does not match the replayed run", 422);
  }
  if (simMs > elapsedMs * 1.1) {
    return err("Run replayed faster than real time allows", 422);
  }

  // Consume the run and record the score atomically; the updateMany guard
  // makes double-submission race-proof, the unique runToken is the backstop.
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.arcadeRun.updateMany({
        where: { id: jti, usedAt: null, voidedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("run consumed concurrently");
      await tx.arcadeScore.create({
        data: { userId: session.userId, game, score, runToken: jti },
      });
    });
  } catch {
    return err("This run was already submitted", 409);
  }

  // Prize boards only rank active burners — tell the player where they
  // stand, using the exact rule the boards use (lifetime + in-window burns).
  const weekStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const eligible = await eligibleBurners([session.userId], weekStart);
  return ok({
    accepted: true,
    score,
    ranked: eligible.has(session.userId),
    verified: true,
  });
});
