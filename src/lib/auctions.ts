// Auction engine. Bids spend from the user's deposited $RIBBIT balance;
// the high bid stays locked, outbid amounts unlock instantly. Settlement is
// lazy (checked on read) so no cron is required, and an anti-snipe window
// extends any auction that receives a bid in its final minutes.
import { prisma } from "./db";
import { ApiError } from "./api";

const ANTI_SNIPE_MS = 2 * 60 * 1000;

export async function settleDueAuctions(): Promise<void> {
  const due = await prisma.auction.findMany({
    where: { status: "live", endsAt: { lte: new Date() } },
    include: {
      bids: {
        where: { status: "active" },
        orderBy: { amountRaw: "desc" },
        take: 1,
      },
    },
  });
  for (const auction of due) {
    // A failed settle rolls back and is retried on the next read; it must
    // not take down the request that happened to trigger lazy settlement.
    try {
      await prisma.$transaction(async (tx) => {
        const winning = auction.bids[0];
        // Claim the auction first — settlement is lazy and can be triggered by
        // any request, so without this guard two concurrent settles would
        // charge the winner twice.
        const claimed = await tx.auction.updateMany({
          where: { id: auction.id, status: "live" },
          data: {
            status: winning ? "settled" : "cancelled",
            winnerUserId: winning?.userId ?? null,
          },
        });
        if (claimed.count === 0) return;

        if (winning) {
          // Consume the winner's locked funds — they bought the item. Guarded
          // so a broken invariant fails loudly instead of going negative.
          const charged = await tx.user.updateMany({
            where: {
              id: winning.userId,
              ribbitBalance: { gte: winning.amountRaw },
              ribbitLocked: { gte: winning.amountRaw },
            },
            data: {
              ribbitBalance: { decrement: winning.amountRaw },
              ribbitLocked: { decrement: winning.amountRaw },
            },
          });
          if (charged.count === 0) {
            throw new Error(`Escrow mismatch settling auction ${auction.id}`);
          }
          await tx.bid.update({
            where: { id: winning.id },
            data: { status: "won" },
          });
          await tx.treasuryEvent.create({
            data: {
              kind: "auction_settle",
              amount: winning.amountRaw,
              asset: "RIBBIT",
              note: `Auction settled: ${auction.title}`,
              ref: auction.id,
            },
          });
        }
      });
    } catch (e) {
      console.error(`settle failed for auction ${auction.id}:`, e);
    }
  }
}

export async function placeBid(
  userId: string,
  auctionId: string,
  amountRaw: bigint,
): Promise<{ endsAt: Date; currentRaw: bigint }> {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== "live")
      throw new ApiError("Auction is not live", 404);
    const now = new Date();
    if (auction.endsAt <= now) throw new ApiError("Auction has ended", 410);

    const minBid =
      auction.currentRaw > 0n
        ? auction.currentRaw + auction.minIncrement
        : auction.startBidRaw;
    if (amountRaw < minBid) {
      throw new ApiError(`Bid must be at least ${minBid.toString()} raw units`);
    }

    const prevHigh = await tx.bid.findFirst({
      where: { auctionId, status: "active" },
    });
    if (prevHigh?.userId === userId) {
      throw new ApiError("You are already the highest bidder");
    }

    // Lock funds. The unlocked check must be column-to-column inside the
    // UPDATE — comparing against a previously-read ribbitLocked lets two
    // concurrent bids (on different auctions) lock the same deposit twice.
    const locked = await tx.$executeRaw`
      UPDATE "User" SET "ribbitLocked" = "ribbitLocked" + ${amountRaw}
      WHERE "id" = ${userId}
        AND "ribbitBalance" - "ribbitLocked" >= ${amountRaw}
    `;
    if (locked === 0) {
      throw new ApiError(
        "Insufficient deposited $RIBBIT — deposit more to bid",
      );
    }

    // Optimistic-lock the auction on currentRaw so two simultaneous bids
    // can't both become the high bid.
    const antiSnipe =
      auction.endsAt.getTime() - now.getTime() < ANTI_SNIPE_MS
        ? new Date(auction.endsAt.getTime() + ANTI_SNIPE_MS)
        : auction.endsAt;
    const updated = await tx.auction.updateMany({
      where: { id: auctionId, currentRaw: auction.currentRaw, status: "live" },
      data: { currentRaw: amountRaw, endsAt: antiSnipe },
    });
    if (updated.count === 0)
      throw new ApiError("Someone bid at the same moment — retry", 409);

    if (prevHigh) {
      await tx.bid.update({
        where: { id: prevHigh.id },
        data: { status: "outbid" },
      });
      await tx.user.update({
        where: { id: prevHigh.userId },
        data: { ribbitLocked: { decrement: prevHigh.amountRaw } },
      });
    }

    await tx.bid.create({
      data: { auctionId, userId, amountRaw, status: "active" },
    });

    return { endsAt: antiSnipe, currentRaw: amountRaw };
  });
}
