// Game resolvers. Each game maps a provably-fair roll in [0,1) plus player
// params to an outcome and a payout in credits. The house edge is applied to
// the payout multiplier, never to the roll itself — odds are exactly what the
// fairness page says they are.
import { z } from "zod";
import { CONFIG } from "./config";
import { getActiveSeed, roll } from "./fairness";
import { adjustCredits, InsufficientCredits } from "./credits";
import { prisma } from "./db";

export const flipParams = z.object({
  side: z.enum(["frog", "fly"]),
  wager: z.number().int().min(CONFIG.minWager).max(CONFIG.maxWager),
  clientSeed: z.string().min(1).max(64),
});

export const diceParams = z.object({
  // Win if roll*100 < target. target 2..98 keeps multipliers sane.
  target: z.number().int().min(2).max(98),
  wager: z.number().int().min(CONFIG.minWager).max(CONFIG.maxWager),
  clientSeed: z.string().min(1).max(64),
});

export type RoundResult = {
  roundId: string;
  game: "flip" | "dice";
  nonce: number;
  seedHash: string;
  outcome: Record<string, unknown>;
  wager: number;
  payout: number;
  win: boolean;
  credits: number; // balance after the round
};

function flipResolve(r: number, side: "frog" | "fly", wager: number) {
  const landed = r < 0.5 ? "frog" : "fly";
  const win = landed === side;
  const multiplier = 2 * (1 - CONFIG.houseEdge);
  const payout = win ? Math.floor(wager * multiplier) : 0;
  return { outcome: { landed, roll: r }, payout, win };
}

function diceResolve(r: number, target: number, wager: number) {
  const rolled = Math.floor(r * 100 * 100) / 100; // 0.00 – 99.99
  const win = rolled < target;
  const multiplier = (100 / target) * (1 - CONFIG.houseEdge);
  const payout = win ? Math.floor(wager * multiplier) : 0;
  return { outcome: { rolled, target, multiplier: Number(multiplier.toFixed(4)) }, payout, win };
}

export { InsufficientCredits };

/**
 * Play one round atomically: debit wager, compute outcome from the committed
 * seed, credit payout, persist the round. The seed nonce is incremented with
 * an optimistic-lock guard so concurrent requests can't reuse a nonce.
 */
export async function playRound(
  userId: string,
  game: "flip" | "dice",
  params: { wager: number; clientSeed: string; side?: "frog" | "fly"; target?: number }
): Promise<RoundResult> {
  const seed = await getActiveSeed(userId);

  return prisma.$transaction(async (tx) => {
    // Claim this nonce; fails (count 0) if another request got there first.
    const claimed = await tx.serverSeed.updateMany({
      where: { id: seed.id, nonce: seed.nonce, active: true },
      data: { nonce: { increment: 1 } },
    });
    if (claimed.count === 0) throw new Error("Concurrent round in flight — retry");
    const nonce = seed.nonce;

    await adjustCredits(tx, userId, -params.wager, "wager");

    const r = roll(seed.seed, params.clientSeed, nonce);
    const resolved =
      game === "flip"
        ? flipResolve(r, params.side!, params.wager)
        : diceResolve(r, params.target!, params.wager);

    const round = await tx.gameRound.create({
      data: {
        userId,
        seedId: seed.id,
        game,
        nonce,
        clientSeed: params.clientSeed,
        params: JSON.stringify(
          game === "flip" ? { side: params.side } : { target: params.target }
        ),
        outcome: JSON.stringify(resolved.outcome),
        wager: params.wager,
        payout: resolved.payout,
        houseTake: params.wager - resolved.payout,
      },
    });

    let credits: number;
    if (resolved.payout > 0) {
      credits = await adjustCredits(tx, userId, resolved.payout, "payout", round.id);
    } else {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      credits = u.credits;
    }

    return {
      roundId: round.id,
      game,
      nonce,
      seedHash: seed.seedHash,
      outcome: resolved.outcome,
      wager: params.wager,
      payout: resolved.payout,
      win: resolved.win,
      credits,
    };
  });
}
