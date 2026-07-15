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
import type { ServerSeed } from "@prisma/client";

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

export async function getActiveSeed(userId: string): Promise<ServerSeed> {
  const existing = await prisma.serverSeed.findFirst({
    where: { userId, active: true },
  });
  if (existing) return existing;
  const seed = randomBytes(32).toString("hex");
  return prisma.serverSeed.create({
    data: { userId, seed, seedHash: sha256Hex(seed) },
  });
}

/**
 * Retire the active seed (revealing it) and commit to a fresh one.
 * Returns the revealed old seed and the new hash.
 */
export async function rotateSeed(userId: string): Promise<{
  revealedSeed: string | null;
  revealedHash: string | null;
  newHash: string;
}> {
  const old = await prisma.serverSeed.findFirst({ where: { userId, active: true } });
  if (old) {
    await prisma.serverSeed.update({
      where: { id: old.id },
      data: { active: false, revealedAt: new Date() },
    });
  }
  const seed = randomBytes(32).toString("hex");
  const fresh = await prisma.serverSeed.create({
    data: { userId, seed, seedHash: sha256Hex(seed) },
  });
  return {
    revealedSeed: old?.seed ?? null,
    revealedHash: old?.seedHash ?? null,
    newHash: fresh.seedHash,
  };
}
