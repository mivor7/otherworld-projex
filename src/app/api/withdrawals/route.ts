// Withdraw unlocked auction balance back to the user's wallet. The balance is
// debited immediately and a pending payout is queued for the treasury signer
// (scripts/payout-worker.ts) — the web server never holds the treasury key.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";

const body = z.object({ amountRaw: z.string().regex(/^[0-9]{1,24}$/) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { amountRaw: raw } = body.parse(await req.json());
  const amountRaw = BigInt(raw);
  if (amountRaw <= 0n) return err("Amount must be positive");

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: session.userId } });
    if (user.ribbitBalance - user.ribbitLocked < amountRaw) return null;
    const debited = await tx.user.updateMany({
      where: {
        id: session.userId,
        ribbitBalance: { gte: user.ribbitLocked + amountRaw },
      },
      data: { ribbitBalance: { decrement: amountRaw } },
    });
    if (debited.count === 0) return null;
    return tx.withdrawal.create({
      data: {
        userId: session.userId,
        amountRaw,
        destination: session.wallet,
      },
    });
  });

  if (!result) return err("Insufficient unlocked balance");
  return ok({ withdrawalId: result.id, status: result.status });
});

export const GET = handler(async () => {
  const session = await requireSession();
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok(withdrawals);
});
