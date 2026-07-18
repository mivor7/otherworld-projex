import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

const body = z.object({
  action: z.enum(["reject", "mark_sent"]),
  signature: z.string().min(64).max(120).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    const wd = await prisma.withdrawal.findUnique({ where: { id } });
    if (!wd || wd.status !== "pending") return err("Withdrawal not found or already processed", 404);

    if (data.action === "reject") {
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

    if (!data.signature) return err("Provide the payout tx signature");
    const marked = await prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawal.updateMany({
        where: { id, status: "pending" },
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
