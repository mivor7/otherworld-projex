// Auction bidding balance: users transfer $RIBBIT to the treasury's token
// account from their own wallet, then submit the tx signature. Verified
// deposits credit the in-app bidding balance 1:1.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyDepositTx } from "@/lib/solana";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ signature: z.string().min(64).max(120) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { signature } = body.parse(await req.json());

  // RPC-lookup guard — same budget as the other chain-verify endpoints.
  rateLimit(`chain-verify:${session.userId}`, 30, 60_000);

  const existing = await prisma.deposit.findUnique({ where: { signature } });
  if (existing) return err("This deposit was already credited", 409);
  // A credit purchase contains a treasury-transfer leg that would ALSO pass
  // deposit verification — one payment must never be redeemable twice, so
  // signatures are unique across BOTH redemption tables.
  const usedAsBuy = await prisma.creditPurchase.findUnique({ where: { signature } });
  if (usedAsBuy) return err("That transaction was a credit purchase — already redeemed", 409);

  const amountRaw = await verifyDepositTx(signature, session.wallet);
  if (amountRaw === null) {
    return err(
      "Could not verify a $RIBBIT transfer to the treasury in that transaction",
      422
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    // FIRST write: the cross-path redemption guard. A buy tx's treasury leg
    // also passes deposit verification, and the pre-checks above are
    // check-then-act — this PK write is what makes one payment redeemable
    // exactly once even under concurrent buy+deposit submits.
    await tx.redeemedSignature.create({ data: { signature, kind: "deposit" } });
    await tx.deposit.create({
      data: { userId: session.userId, signature, amountRaw },
    });
    return tx.user.update({
      where: { id: session.userId },
      data: { ribbitBalance: { increment: amountRaw } },
    });
  });

  return ok({
    credited: amountRaw,
    ribbitBalance: user.ribbitBalance,
    ribbitLocked: user.ribbitLocked,
  });
});
