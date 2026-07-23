// Admin action-queue badge — the count of things that actually need the
// operator to DO something, derived live (same source as the admin overview).
// Unlike the player feed this needs no "seen" watermark: it's a queue, so the
// number falls on its own as items are processed. Everything here self-clears:
//   · withdrawals pending/processing → pay or reject them
//   · listing applications pending    → approve or reject
//   · settled auctions unfulfilled    → arrange delivery, mark fulfilled
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

// Live data — never cache; the count changes as the operator works the queue.
export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const GET = handler(async () => {
  await requireAdmin();

  const [withdrawals, applications, unfulfilled, bounties] = await Promise.all([
    prisma.withdrawal.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.listingApplication.count({ where: { status: "pending" } }),
    prisma.auction.count({ where: { status: "settled", fulfilled: false } }),
    // Leaderboard bounties needing a human in Payout review: closed-unpaid,
    // PLUS manual (non-auto) bounties past their deadline — those never
    // transition on their own, they sit "open" until an admin awards or closes
    // them, so counting only "closed" would leave exactly the bounties that
    // require manual action un-flagged. Self-clears when settled.
    prisma.bounty.count({
      where: {
        kind: "leaderboard",
        OR: [
          { status: "closed" },
          { status: "open", autoPay: false, endsAt: { lte: new Date() } },
        ],
      },
    }),
  ]);

  const items: {
    id: string;
    count: number;
    title: string;
    href: string;
    tone: "gold" | "portal" | "neon";
  }[] = [];

  if (bounties > 0)
    items.push({
      id: "bounties",
      count: bounties,
      title: `${plural(bounties, "bounty", "bounties")} to settle`,
      href: "/admin#settle",
      tone: "gold",
    });
  if (withdrawals > 0)
    items.push({
      id: "withdrawals",
      count: withdrawals,
      title: `${plural(withdrawals, "payout")} to process`,
      href: "/admin#payouts",
      tone: "gold",
    });
  if (applications > 0)
    items.push({
      id: "applications",
      count: applications,
      title: `${plural(applications, "listing application")} to review`,
      href: "/admin#applications",
      tone: "portal",
    });
  if (unfulfilled > 0)
    items.push({
      id: "fulfillment",
      count: unfulfilled,
      title: `${plural(unfulfilled, "won lot")} awaiting delivery`,
      href: "/admin#deliver",
      tone: "neon",
    });

  return ok({
    total: withdrawals + applications + unfulfilled + bounties,
    counts: { withdrawals, applications, unfulfilled, bounties },
    items,
  });
});
