// Credits ledger. All balance changes go through these helpers inside a
// transaction and leave an append-only LedgerEntry row, so the books always
// reconcile: user.credits === sum(ledger deltas).
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export class InsufficientCredits extends Error {
  constructor() {
    super("Insufficient credits");
  }
}

type Tx = Prisma.TransactionClient;

export async function adjustCredits(
  tx: Tx,
  userId: string,
  delta: number,
  kind: "burn" | "wager" | "payout" | "bounty" | "admin",
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

export async function getBalances(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    credits: user.credits,
    ribbitBalance: user.ribbitBalance,
    ribbitLocked: user.ribbitLocked,
    ribbitAvailable: user.ribbitBalance - user.ribbitLocked,
  };
}
