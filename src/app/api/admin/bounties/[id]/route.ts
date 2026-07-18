// Manage one bounty: close it early, cancel it, or award & pay the prize.
// Awarding recomputes the authoritative ranking server-side and queues real
// $RIBBIT payouts to the winners — see lib/bounty.awardBounty.
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { awardBounty } from "@/lib/bounty";

const body = z.object({
  action: z.enum(["close", "cancel", "award"]),
  // Award only: prize split by percentage across the top places (sums to 100).
  splits: z.array(z.number().positive()).min(1).max(10).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    if (data.action === "award") {
      const result = await awardBounty(id, data.splits ?? [100]);
      return ok(result);
    }

    const bounty = await prisma.bounty.findUnique({ where: { id } });
    if (!bounty) return err("Bounty not found", 404);
    if (bounty.status === "paid") return err("Bounty already paid", 409);

    if (data.action === "close") {
      const claimed = await prisma.bounty.updateMany({
        where: { id, status: "open" },
        data: { status: "closed", endsAt: new Date() },
      });
      if (claimed.count === 0) return err("Bounty is not open", 409);
      return ok({ status: "closed" });
    }

    // cancel — no payout, board archived
    const claimed = await prisma.bounty.updateMany({
      where: { id, status: { in: ["open", "closed"] } },
      data: { status: "cancelled", endsAt: new Date() },
    });
    if (claimed.count === 0) return err("Bounty cannot be cancelled", 409);
    return ok({ status: "cancelled" });
  }
);
