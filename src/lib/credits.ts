// App balance. Players deposit $OWP to the treasury and play from that balance.
// Every change goes through these helpers inside a transaction and leaves an
// append-only LedgerEntry (whole tokens). Auction bids lock a slice of the
// same balance; wagers and withdrawals can only spend the unlocked part.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fromRaw, toRaw } from "./config";

export class InsufficientCredits extends Error {
  constructor() {
    super("Insufficient $OWP balance");
  }
}

/** Unlocked whole $OWP the player can wager or withdraw. */
export function playableWhole(balance: bigint, locked: bigint): number {
  const avail = balance - locked;
  if (avail <= 0n) return 0;
  return Math.floor(fromRaw(avail));
}

type Tx = Prisma.TransactionClient;

export async function adjustCredits(
  tx: Tx,
  userId: string,
  delta: number,
  kind: "burn" | "buy" | "wager" | "payout" | "bounty" | "admin",
  ref?: string
): Promise<number> {
  if (!Number.isInteger(delta)) throw new Error("Credit delta must be an integer");
  if (delta < 0) {
    // Guarded decrement: only succeeds if the balance covers it (prevents
    // double-spend races between concurrent requests).
    const res = await tx.user.updateMany({
      where: { id: userId, credits: { gte: -delta } },
      data: { credits: { increment: delta } },
    });
    if (res.count === 0) throw new InsufficientCredits();
  } else if (delta > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: delta } },
    });
  }
  await tx.ledgerEntry.create({ data: { userId, delta, kind, ref } });
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  return user.credits;
}

/**
 * Move whole $OWP on the app balance. Negative amounts only succeed when the
 * unlocked balance covers them, so a bid lock and a wager can't both spend
 * the same tokens.
 */
export async function adjustOwp(
  tx: Tx,
  userId: string,
  deltaWhole: number,
  kind: "wager" | "payout" | "bounty" | "admin",
  ref?: string
): Promise<number> {
  if (!Number.isInteger(deltaWhole)) throw new Error("OWP delta must be an integer");
  if (deltaWhole < 0) {
    const raw = toRaw(-deltaWhole);
    const res = await tx.$executeRaw`
      UPDATE "User" SET "ribbitBalance" = "ribbitBalance" - ${raw}
      WHERE "id" = ${userId}
        AND "ribbitBalance" - "ribbitLocked" >= ${raw}
    `;
    if (res === 0) throw new InsufficientCredits();
  } else if (deltaWhole > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { ribbitBalance: { increment: toRaw(deltaWhole) } },
    });
  }
  if (deltaWhole !== 0) {
    await tx.ledgerEntry.create({ data: { userId, delta: deltaWhole, kind, ref } });
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  return playableWhole(user.ribbitBalance, user.ribbitLocked);
}

export async function getBalances(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    credits: user.credits,
    ribbitBalance: user.ribbitBalance,
    ribbitLocked: user.ribbitLocked,
    ribbitAvailable: user.ribbitBalance - user.ribbitLocked,
  };
}
