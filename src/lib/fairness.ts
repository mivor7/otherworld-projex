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

/**
 * The left/right path a plinko drop takes (0 = left, 1 = right) — one bit per
 * row, read from the committed seed so the whole fall is independently
 * verifiable. Uses hex nibble i of HMAC-SHA256(serverSeed, clientSeed:nonce);
 * nibble ≥ 8 → right, an even 50/50 per peg.
 */
export function plinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number
): number[] {
  const digest = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
  const path: number[] = [];
  for (let i = 0; i < rows; i++) path.push(parseInt(digest[i], 16) >= 8 ? 1 : 0);
  return path;
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
