// Withdraw unlocked auction balance back to the user's wallet. The balance is
// debited immediately and a pending payout is queued for the treasury signer
// (scripts/payout-worker.ts) — the web server never holds the treasury key.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";

const body = z.object({ amountRaw: z.string().regex(/^[0-9]{1,18}$/) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { amountRaw: raw } = body.parse(await req.json());
  const amountRaw = BigInt(raw);
  if (amountRaw <= 0n) return err("Amount must be positive");

  const result = await prisma.$transaction(async (tx) => {
    // Atomic column-to-column guard: a concurrent bid can raise ribbitLocked
    // between a read and a write, so the unlocked check must happen inside
    // the UPDATE itself — never against a previously-read value.
    const debited = await tx.$executeRaw`
      UPDATE "User" SET "ribbitBalance" = "ribbitBalance" - ${amountRaw}
      WHERE "id" = ${session.userId}
        AND "ribbitBalance" - "ribbitLocked" >= ${amountRaw}
    `;
    if (debited === 0) return null;
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
