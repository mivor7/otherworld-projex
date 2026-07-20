// Game resolvers. Each game maps a provably-fair roll in [0,1) plus player
// params to an outcome and a payout in credits. The house edge is applied to
// the payout multiplier, never to the roll itself — odds are exactly what the
// fairness page says they are.
import { z } from "zod";
import { getActiveSeed, roll, plinkoPath } from "./fairness";
import { PLINKO_ROWS, plinkoTable } from "./client-config";
import { adjustCredits, InsufficientCredits } from "./credits";
import { prisma } from "./db";
import { houseConfig, type HouseConfig } from "./settings";
import { ApiError } from "./api";

// Wager bounds are LIVE settings (admin-tunable), so the schemas only shape-
// check; assertWagerAllowed() enforces the effective bounds per round.
export const flipParams = z.object({
  side: z.enum(["frog", "fly"]),
  wager: z.number().int().min(1).max(100_000_000),
  clientSeed: z.string().min(1).max(64),
});

export const diceParams = z.object({
  // Win if roll*100 < target. target 2..98 keeps multipliers sane.
  target: z.number().int().min(2).max(98),
  wager: z.number().int().min(1).max(100_000_000),
  clientSeed: z.string().min(1).max(64),
});

export const plinkoParams = z.object({
  // Fixed board (PLINKO_ROWS); only the wager + client seed vary per drop.
  wager: z.number().int().min(1).max(100_000_000),
  clientSeed: z.string().min(1).max(64),
});

/** Enforce the live table rules before any round is dealt. */
export function assertWagerAllowed(cfg: HouseConfig, wager: number): void {
  if (cfg.gamesPaused) {
    throw new ApiError("The tables are paused — back shortly", 423);
  }
  if (wager < cfg.minWager || wager > cfg.maxWager) {
    throw new ApiError(
      `Wager must be between ${cfg.minWager} and ${cfg.maxWager} credits`,
      422
    );
  }
}

export type RoundResult = {
  roundId: string;
  game: "flip" | "dice" | "plinko";
  nonce: number;
  seedHash: string;
  outcome: Record<string, unknown>;
  wager: number;
  payout: number;
  win: boolean;
  credits: number; // balance after the round
};

function flipResolve(r: number, side: "frog" | "fly", wager: number, edge: number) {
  const landed = r < 0.5 ? "frog" : "fly";
  const win = landed === side;
  const multiplier = 2 * (1 - edge);
  const payout = win ? Math.floor(wager * multiplier) : 0;
  return { outcome: { landed, roll: r }, payout, win };
}

function diceResolve(r: number, target: number, wager: number, edge: number) {
  const rolled = Math.floor(r * 100 * 100) / 100; // 0.00 – 99.99
  const win = rolled < target;
  const multiplier = (100 / target) * (1 - edge);
  const payout = win ? Math.floor(wager * multiplier) : 0;
  return { outcome: { rolled, target, multiplier: Number(multiplier.toFixed(4)) }, payout, win };
}

function plinkoResolve(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  wager: number,
  edge: number
) {
  const path = plinkoPath(serverSeed, clientSeed, nonce, PLINKO_ROWS);
  const bucket = path.reduce((a, b) => a + b, 0); // 0..rows = number of rights
  const table = plinkoTable(edge);
  const mult = table[bucket];
  const payout = Math.floor(wager * mult);
  // The full board + path travel to the client so it can replay the exact fall
  // and anyone can re-derive it from the revealed seed.
  return {
    outcome: {
      path,
      bucket,
      rows: PLINKO_ROWS,
      mult: Number(mult.toFixed(4)),
      table: table.map((m) => Number(m.toFixed(2))),
    },
    payout,
    win: payout > wager,
  };
}

export { InsufficientCredits };

/**
 * Play one round atomically: debit wager, compute outcome from the committed
 * seed, credit payout, persist the round. The seed nonce is incremented with
 * an optimistic-lock guard so concurrent requests can't reuse a nonce.
 */
export async function playRound(
  userId: string,
  game: "flip" | "dice" | "plinko",
  params: { wager: number; clientSeed: string; side?: "frog" | "fly"; target?: number }
): Promise<RoundResult> {
  const cfg = await houseConfig();
  assertWagerAllowed(cfg, params.wager);
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

    const resolved =
      game === "flip"
        ? flipResolve(roll(seed.seed, params.clientSeed, nonce), params.side!, params.wager, cfg.houseEdge)
        : game === "dice"
          ? diceResolve(roll(seed.seed, params.clientSeed, nonce), params.target!, params.wager, cfg.houseEdge)
          : plinkoResolve(seed.seed, params.clientSeed, nonce, params.wager, cfg.houseEdge);

    const round = await tx.gameRound.create({
      data: {
        userId,
        seedId: seed.id,
        game,
        nonce,
        clientSeed: params.clientSeed,
        params: JSON.stringify(
          game === "flip"
            ? { side: params.side }
            : game === "dice"
              ? { target: params.target }
              : { rows: PLINKO_ROWS }
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
