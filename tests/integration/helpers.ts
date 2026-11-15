// Shared fixtures for the database-backed tests. Every row a test creates
// hangs off a user made here, and cleanup() removes exactly those rows.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";

export const HAS_DB = !!process.env.TEST_DATABASE_URL;

const created: string[] = [];

/** A fresh player with `whole` $OWP of unlocked balance. */
export async function makeUser(whole = 1_000_000): Promise<{ id: string; wallet: string }> {
  const user = await prisma.user.create({
    data: { wallet: `test-${randomUUID()}`, ribbitBalance: toRaw(whole) },
    select: { id: true, wallet: true },
  });
  created.push(user.id);
  return user;
}

export async function cleanup(): Promise<void> {
  const userId = { in: created.splice(0) };
  if (userId.in.length === 0) return;
  await prisma.bountyAward.deleteMany({ where: { userId } });
  await prisma.owpPurchase.deleteMany({ where: { userId } });
  await prisma.withdrawal.deleteMany({ where: { userId } });
  await prisma.deposit.deleteMany({ where: { userId } });
  await prisma.gameRound.deleteMany({ where: { userId } });
  await prisma.serverSeed.deleteMany({ where: { userId } });
  await prisma.ledgerEntry.deleteMany({ where: { userId } });
  await prisma.bid.deleteMany({ where: { userId } });
  await prisma.arcadeScore.deleteMany({ where: { userId } });
  await prisma.arcadeRun.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

/** A promise plus its resolver, for holding a transaction open on purpose. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => (open = resolve));
  return { wait, open };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
