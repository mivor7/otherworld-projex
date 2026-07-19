// Manage one auction: edit it, cancel (refund the high bidder), end it now
// (settle immediately), delete a bid-less mistake, or mark a settled lot
// fulfilled (delivery tracking for physical / RWA items).
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { cancelAuction, endAuctionNow } from "@/lib/auctions";

const body = z.object({
  action: z.enum(["edit", "cancel", "end_now", "delete", "mark_fulfilled"]),
  note: z.string().max(500).optional(),
  // Edit only — all optional; only provided fields change.
  title: z.string().min(3).max(80).optional(),
  description: z.string().min(10).max(2000).optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  // Terms — only editable while the lot has no bids (bidders committed to
  // the posted terms).
  startBidRibbit: z.number().positive().optional(),
  minIncrementRibbit: z.number().positive().optional(),
  extendHours: z.number().int().min(-336).max(336).optional(),
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

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: { _count: { select: { bids: true } } },
    });
    if (!auction) return err("Auction not found", 404);

    if (data.action === "edit") {
      if (auction.status !== "live") return err("Only live lots can be edited", 409);
      const hasBids = auction._count.bids > 0;
      const changesTerms =
        data.startBidRibbit !== undefined ||
        data.minIncrementRibbit !== undefined ||
        data.extendHours !== undefined;
      // Copy fixes are always fine; the TERMS people bid on are frozen the
      // moment the first bid lands (except honest deadline extensions, which
      // only ever give bidders more time — shortening is bid-less only).
      if (hasBids && (data.startBidRibbit !== undefined || data.minIncrementRibbit !== undefined)) {
        return err("This lot has bids — its terms are locked", 409);
      }
      if (hasBids && data.extendHours !== undefined && data.extendHours < 0) {
        return err("This lot has bids — the deadline can only be extended", 409);
      }
      void changesTerms;
      const updated = await prisma.auction.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
          ...(data.startBidRibbit !== undefined
            ? { startBidRaw: toRaw(data.startBidRibbit) }
            : {}),
          ...(data.minIncrementRibbit !== undefined
            ? { minIncrement: toRaw(data.minIncrementRibbit) }
            : {}),
          ...(data.extendHours
            ? { endsAt: new Date(auction.endsAt.getTime() + data.extendHours * 3600e3) }
            : {}),
        },
      });
      return ok({ status: updated.status, endsAt: updated.endsAt });
    }

    if (data.action === "delete") {
      // Only a mistake nobody has touched: no bids, and never settled (a
      // settled lot is a sale record).
      if (auction._count.bids > 0 || auction.status === "settled") {
        return err("This lot has history — cancel it instead of deleting", 409);
      }
      await prisma.auction.delete({ where: { id } });
      return ok({ deleted: true });
    }

    // mark_fulfilled — only meaningful once the lot has a winner
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
