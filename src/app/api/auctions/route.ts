import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { settleDueAuctions } from "@/lib/auctions";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

// Public serializer: shorten the seller wallet (full pubkeys deanonymize
// consignors — every other public feed shortens wallets) and drop internal /
// operational fields (winner's internal id, delivery notes).
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
function publicAuction<T extends { sellerWallet: string | null }>(a: T) {
  return {
    ...a,
    sellerWallet: a.sellerWallet ? short(a.sellerWallet) : null,
    winnerUserId: undefined,
    fulfillmentNote: undefined,
  };
}

export const GET = handler(async () => {
  await settleDueAuctions();
  const [live, past] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "live" },
      orderBy: { endsAt: "asc" },
      include: { _count: { select: { bids: true } } },
      take: 100,
    }),
    prisma.auction.findMany({
      where: { status: { in: ["settled", "cancelled"] } },
      orderBy: { endsAt: "desc" },
      take: 12,
      include: { _count: { select: { bids: true } } },
    }),
  ]);
  return ok({ live: live.map(publicAuction), past: past.map(publicAuction) });
});
