import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

const body = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
  // On approve: auction runtime in hours and minimum increment in raw units.
  durationHours: z.number().int().min(1).max(14 * 24).default(72),
  minIncrementRaw: z.string().regex(/^[0-9]{1,24}$/).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    const app = await prisma.listingApplication.findUnique({
      where: { id },
      include: { user: { select: { wallet: true } } },
    });
    if (!app || app.status !== "pending") return err("Application not found or already reviewed", 404);

    if (data.action === "reject") {
      await prisma.listingApplication.update({
        where: { id },
        data: { status: "rejected", reviewNote: data.note },
      });
      return ok({ status: "rejected" });
    }

    const auction = await prisma.$transaction(async (tx) => {
      await tx.listingApplication.update({
        where: { id },
        data: { status: "approved", reviewNote: data.note },
      });
      return tx.auction.create({
        data: {
          title: app.title,
          description: app.description,
          imageUrl: app.imageUrl,
          category: app.category,
          sellerWallet: app.user.wallet,
          startBidRaw: app.askRaw,
          minIncrement: data.minIncrementRaw
            ? BigInt(data.minIncrementRaw)
            : app.askRaw / 20n + 1n, // default: 5% steps
          endsAt: new Date(Date.now() + data.durationHours * 3600 * 1000),
        },
      });
    });
    return ok({ status: "approved", auctionId: auction.id });
  }
);
