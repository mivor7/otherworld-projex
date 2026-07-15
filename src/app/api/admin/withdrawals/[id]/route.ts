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
      // Refund the debited balance.
      await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id },
          data: { status: "rejected", processedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: wd.userId },
          data: { ribbitBalance: { increment: wd.amountRaw } },
        }),
      ]);
      return ok({ status: "rejected" });
    }

    if (!data.signature) return err("Provide the payout tx signature");
    await prisma.$transaction([
      prisma.withdrawal.update({
        where: { id },
        data: { status: "sent", signature: data.signature, processedAt: new Date() },
      }),
      prisma.treasuryEvent.create({
        data: {
          kind: "payout",
          amount: wd.amountRaw,
          asset: "RIBBIT",
          note: `Withdrawal to ${wd.destination.slice(0, 4)}…`,
          ref: data.signature,
        },
      }),
    ]);
    return ok({ status: "sent" });
  }
);
