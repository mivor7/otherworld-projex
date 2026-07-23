// Withdraw unlocked auction balance back to the user's wallet. The balance is
// debited immediately and a pending payout is queued for the off-server payout
// worker (scripts/payout-worker.mjs), which signs from a dedicated hot wallet —
// the web server never holds any private key.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { toRaw } from "@/lib/config";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

const body = z.object({ amountRaw: z.string().regex(/^[0-9]{1,18}$/) });

// Every queued withdrawal costs the house a real on-chain fee to pay out, so
// dust requests are an economic drain: floor the amount and cap the rate.
const MIN_WITHDRAW_RIBBIT = 1;

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { amountRaw: raw } = body.parse(await req.json());
  const amountRaw = BigInt(raw);
  if (amountRaw <= 0n) return err("Amount must be positive");
  if (amountRaw < toRaw(MIN_WITHDRAW_RIBBIT)) {
    return err(`Minimum withdrawal is ${MIN_WITHDRAW_RIBBIT} $RIBBIT`);
  }
  rateLimit(`withdraw:${session.userId}`, 10, 3_600_000);

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
