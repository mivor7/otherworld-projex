import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

const body = z.object({
  action: z.enum(["claim", "release", "reject", "mark_sent"]),
  signature: z.string().min(64).max(120).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    const wd = await prisma.withdrawal.findUnique({ where: { id } });
    if (!wd) return err("Withdrawal not found", 404);

    // Claim BEFORE paying — the same discipline as the payout worker. "Pay
    // now" must win this claim before any money moves, so the worker and the
    // admin (or two admin tabs) can never both send the same withdrawal.
    if (data.action === "claim") {
      const claimed = await prisma.withdrawal.updateMany({
        where: { id, status: "pending" },
        data: { status: "processing" },
      });
      if (claimed.count === 0) {
        return err("Not claimable — the worker or another admin got it first", 409);
      }
      return ok({ status: "processing" });
    }

    // Undo an admin claim when the send FAILED before anything hit the chain.
    // Never call this after a successful send — mark it sent instead.
    if (data.action === "release") {
      const released = await prisma.withdrawal.updateMany({
        where: { id, status: "processing" },
        data: { status: "pending" },
      });
      if (released.count === 0) return err("Not in processing", 409);
      return ok({ status: "pending" });
    }

    if (data.action === "reject") {
      if (wd.status !== "pending") {
        // Refunding a claimed/in-flight row could race a real send — resolve
        // those with mark_sent (money moved) or release (nothing moved) first.
        return err("Only pending withdrawals can be rejected", 409);
      }
      // Refund the debited balance. The status guard INSIDE the transaction
      // makes this once-only — a double-click or a race with the payout
      // worker can never refund twice or refund a paid withdrawal.
      const refunded = await prisma.$transaction(async (tx) => {
        const claimed = await tx.withdrawal.updateMany({
          where: { id, status: "pending" },
          data: { status: "rejected", processedAt: new Date() },
        });
        if (claimed.count === 0) return false;
        await tx.user.update({
          where: { id: wd.userId },
          data: { ribbitBalance: { increment: wd.amountRaw } },
        });
        return true;
      });
      if (!refunded) return err("Already processed by another action", 409);
      return ok({ status: "rejected" });
    }

    // mark_sent — accepts pending (the "paid elsewhere" manual path) AND
    // processing (the claim→pay flow, and reconciling a worker limbo row,
    // which the worker's own guidance directs here).
    if (!data.signature) return err("Provide the payout tx signature");
    // One on-chain payment reconciles one withdrawal — a signature already
    // recorded on another row is a fat-finger or reuse; refuse it.
    const sigTaken = await prisma.withdrawal.findFirst({
      where: { signature: data.signature, NOT: { id } },
      select: { id: true },
    });
    if (sigTaken) return err("That signature is already recorded on another withdrawal", 409);
    const marked = await prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawal.updateMany({
        where: { id, status: { in: ["pending", "processing"] } },
        data: { status: "sent", signature: data.signature, processedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.treasuryEvent.create({
        data: {
          kind: "payout",
          amount: wd.amountRaw,
          asset: "RIBBIT",
          note: `Withdrawal to ${wd.destination.slice(0, 4)}…`,
          ref: data.signature,
        },
      });
      return true;
    });
    if (!marked) return err("Already processed by another action", 409);
    return ok({ status: "sent" });
  }
);
