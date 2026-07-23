import { err, handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { settleDueAuctions } from "@/lib/auctions";
import { getSession } from "@/lib/session";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await settleDueAuctions();
    const { id } = await ctx.params;
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bids: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { user: { select: { wallet: true } } },
        },
      },
    });
    if (!auction) return err("Auction not found", 404);
    const session = await getSession();
    return ok({
      ...auction,
      // Public payload: shorten the seller (full pubkeys deanonymize
      // consignors) and drop internal/operational fields — bidders below are
      // already shortened.
      sellerWallet: auction.sellerWallet
        ? `${auction.sellerWallet.slice(0, 4)}…${auction.sellerWallet.slice(-4)}`
        : null,
      winnerUserId: undefined,
      fulfillmentNote: undefined,
      bids: auction.bids.map((b) => ({
        id: b.id,
        amountRaw: b.amountRaw,
        status: b.status,
        createdAt: b.createdAt,
        bidder: `${b.user.wallet.slice(0, 4)}…${b.user.wallet.slice(-4)}`,
        isYou: session?.userId === b.userId,
      })),
    });
  }
);
