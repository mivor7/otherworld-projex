// Provably-fair engine (commit–reveal).
//
// - The server generates a random 32-byte seed and publishes sha256(seed)
//   BEFORE any round is played against it.
// - Each round's outcome = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`),
//   so the server cannot bias results without changing the committed hash,
//   and the player contributes entropy via clientSeed.
// - When the player rotates seeds, the old seed is revealed so every past
//   round can be independently re-computed. See /fairness for the verifier.
import { createHash, createHmac, randomBytes } from "crypto";
import { prisma } from "./db";
import type { Prisma, ServerSeed } from "@prisma/client";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Deterministic float in [0, 1) from the committed seed + player entropy. */
export function roll(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
  return parseInt(digest.slice(0, 8), 16) / 0x100000000;
}

/** Thrown when a seed cannot be revealed because a round dealt from it is still open. */
export class SeedInUseError extends Error {
  constructor() {
    super("A round dealt from this seed is still open");
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Serialize seed creation and rotation for one user. Transaction-scoped, so
 * it is released on commit or rollback and is safe behind a pooled
 * connection. Rounds never take this lock — they only touch the seed row.
 */
async function lockSeeds(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`seed:${userId}`}, 0))`;
}

function freshSeed(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: sha256Hex(seed) };
}

// Oldest first: if a wallet ever ends up with two active seeds, every reader
// agrees on which one is committed and in play.
const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];

export async function getActiveSeed(userId: string): Promise<ServerSeed> {
  const existing = await prisma.serverSeed.findFirst({
    where: { userId, active: true },
    orderBy: OLDEST_FIRST,
  });
  if (existing) return existing;
  // First seed for this wallet. Two requests can arrive together (two tabs,
  // or /api/auth/me next to a first round), so create under the lock and
  // look again once it is held.
  return prisma.$transaction(async (tx) => {
    await lockSeeds(tx, userId);
    const raced = await tx.serverSeed.findFirst({
      where: { userId, active: true },
      orderBy: OLDEST_FIRST,
    });
    if (raced) return raced;
    return tx.serverSeed.create({ data: { userId, ...freshSeed() } });
  });
}

/**
 * Retire the active seed (revealing it) and commit to a fresh one.
 * Returns the revealed old seed and the new hash.
 *
 * A revealed seed gives away every card of a blackjack hand dealt from it,
 * so the reveal and the "no open round" check have to be one atomic step.
 * The order below is what makes it so:
 *
 *   1. Retire the seed. That UPDATE takes the seed's row lock. A deal that
 *      already claimed a nonce holds the same lock until it commits, so this
 *      statement waits for it. A deal that has not claimed yet will find the
 *      seed inactive and fail.
 *   2. Only then count open rounds on the seed. Every round that could have
 *      been dealt from it is committed and visible by now.
 *   3. If one is open, throw. The transaction rolls back and the seed stays
 *      active and secret.
 */
export async function rotateSeed(userId: string): Promise<{
  revealedSeed: string | null;
  revealedHash: string | null;
  newHash: string;
}> {
  return prisma.$transaction(async (tx) => {
    await lockSeeds(tx, userId);
    const retiring = await tx.serverSeed.findMany({
      where: { userId, active: true },
      orderBy: OLDEST_FIRST,
    });
    const ids = retiring.map((s) => s.id);
    if (ids.length > 0) {
      await tx.serverSeed.updateMany({
        where: { id: { in: ids }, active: true },
        data: { active: false, revealedAt: new Date() },
      });
      const open = await tx.gameRound.count({
        where: { seedId: { in: ids }, settled: false },
      });
      if (open > 0) throw new SeedInUseError();
    }
    const fresh = await tx.serverSeed.create({ data: { userId, ...freshSeed() } });
    const old = retiring[0];
    return {
      revealedSeed: old?.seed ?? null,
      revealedHash: old?.seedHash ?? null,
      newHash: fresh.seedHash,
    };
  });
}
