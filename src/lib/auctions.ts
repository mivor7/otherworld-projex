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
    include: { bids: { where: { status: "active" }, take: 1 } },
  });
  for (const auction of due) {
    await prisma.$transaction(async (tx) => {
      const winning = auction.bids[0];
      if (winning) {
        // Consume the winner's locked funds — they bought the item.
        await tx.user.update({
          where: { id: winning.userId },
          data: {
            ribbitBalance: { decrement: winning.amountRaw },
            ribbitLocked: { decrement: winning.amountRaw },
          },
        });
        await tx.bid.update({ where: { id: winning.id }, data: { status: "won" } });
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
      await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: winning ? "settled" : "cancelled",
          winnerUserId: winning?.userId ?? null,
        },
      });
    });
  }
}

export async function placeBid(
  userId: string,
  auctionId: string,
  amountRaw: bigint
): Promise<{ endsAt: Date; currentRaw: bigint }> {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== "live") throw new ApiError("Auction is not live", 404);
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

    // Lock funds, guarded against overdraw races: only succeeds if
    // balance - locked >= amount at write time.
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const available = user.ribbitBalance - user.ribbitLocked;
    if (available < amountRaw) {
      throw new ApiError("Insufficient deposited $RIBBIT — deposit more to bid");
    }
    const locked = await tx.user.updateMany({
      where: { id: userId, ribbitBalance: { gte: user.ribbitLocked + amountRaw } },
      data: { ribbitLocked: { increment: amountRaw } },
    });
    if (locked.count === 0) throw new ApiError("Insufficient deposited $RIBBIT");

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
    if (updated.count === 0) throw new ApiError("Someone bid at the same moment — retry", 409);

    if (prevHigh) {
      await tx.bid.update({ where: { id: prevHigh.id }, data: { status: "outbid" } });
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
