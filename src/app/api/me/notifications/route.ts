// A player's notification feed — DERIVED live from the rows that already record
// every money-moving event (no notifications table to maintain, same philosophy
// as /api/me/badges). "Seen" state is inherently per-device, so it lives in the
// browser (localStorage); this route only supplies the events + their times.
//   · bounty won         → BountyAward
//   · prize / withdrawal paid, or rejected → Withdrawal status
//   · auction won        → Auction.winnerUserId
import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fromRaw } from "@/lib/config";

// Live data — never cache; the whole point is a fresh unread count.
export const dynamic = "force-dynamic";

const LOOKBACK_MS = 60 * 24 * 3600 * 1000; // surface events from the last 60 days
const fmt = (n: number) => Math.round(n).toLocaleString();

type Notif = {
  id: string;
  type: "bounty_win" | "payout_sent" | "payout_rejected" | "auction_won";
  time: string; // ISO — the client compares this to its last-seen watermark
  title: string;
  body: string;
  amountRibbit?: number;
  href: string;
  tone: "gold" | "neon" | "danger" | "portal";
  signature?: string | null;
};

export const GET = handler(async () => {
  const session = await requireSession();
  const uid = session.userId;
  const since = new Date(Date.now() - LOOKBACK_MS);

  const [awards, payouts, auctionsWon] = await Promise.all([
    prisma.bountyAward.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { bounty: { select: { title: true } } },
    }),
    prisma.withdrawal.findMany({
      where: {
        userId: uid,
        status: { in: ["sent", "rejected"] },
        processedAt: { gte: since },
      },
      orderBy: { processedAt: "desc" },
      take: 25,
    }),
    prisma.auction.findMany({
      where: { winnerUserId: uid, status: "settled", endsAt: { gte: since } },
      orderBy: { endsAt: "desc" },
      take: 10,
    }),
  ]);

  const items: Notif[] = [];

  for (const a of awards) {
    items.push({
      id: `award:${a.id}`,
      type: "bounty_win",
      time: a.createdAt.toISOString(),
      title: `Bounty won — ${a.bounty.title}`,
      body: `You placed #${a.rank}. Your prize is queued for payout.`,
      amountRibbit: Math.round(fromRaw(a.amountRaw)),
      href: "/account",
      tone: "gold",
    });
  }

  for (const w of payouts) {
    const amt = Math.round(fromRaw(w.amountRaw));
    const when = (w.processedAt ?? w.createdAt).toISOString();
    if (w.status === "sent") {
      items.push({
        id: `wd:${w.id}`,
        type: "payout_sent",
        time: when,
        title: w.kind === "bounty" ? "Prize paid" : "Withdrawal sent",
        body: `${fmt(amt)} $RIBBIT landed in your wallet.`,
        amountRibbit: amt,
        href: "/account",
        tone: "neon",
        signature: w.signature,
      });
    } else {
      items.push({
        id: `wd:${w.id}`,
        type: "payout_rejected",
        time: when,
        title: "Withdrawal declined",
        body: `Your ${fmt(amt)} $RIBBIT withdrawal was declined and refunded to your balance.`,
        href: "/account",
        tone: "danger",
      });
    }
  }

  for (const au of auctionsWon) {
    items.push({
      id: `auction:${au.id}`,
      type: "auction_won",
      time: au.endsAt.toISOString(),
      title: `Auction won — ${au.title}`,
      body: "You took this lot. Delivery details follow from the house.",
      href: "/account",
      tone: "portal",
    });
  }

  // Newest first, capped — a tidy feed, not an archive.
  items.sort((a, b) => (a.time < b.time ? 1 : -1));
  return ok({ items: items.slice(0, 30) });
});
