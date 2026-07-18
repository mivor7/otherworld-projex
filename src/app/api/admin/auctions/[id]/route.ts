// Manage one auction: cancel (refund the high bidder), end it now (settle
// immediately), or mark a settled lot fulfilled (delivery tracking for
// physical / RWA items).
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { cancelAuction, endAuctionNow } from "@/lib/auctions";

const body = z.object({
  action: z.enum(["cancel", "end_now", "mark_fulfilled"]),
  note: z.string().max(500).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    if (data.action === "cancel") {
      await cancelAuction(id);
      return ok({ status: "cancelled" });
    }

    if (data.action === "end_now") {
      await endAuctionNow(id);
      const a = await prisma.auction.findUnique({ where: { id } });
      return ok({ status: a?.status ?? "settled" });
    }

    // mark_fulfilled — only meaningful once the lot has a winner
    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return err("Auction not found", 404);
    if (auction.status !== "settled") {
      return err("Only settled lots can be marked delivered", 409);
    }
    await prisma.auction.update({
      where: { id },
      data: { fulfilled: true, fulfillmentNote: data.note ?? null },
    });
    return ok({ fulfilled: true });
  }
);
