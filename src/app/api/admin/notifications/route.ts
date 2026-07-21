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

  const [withdrawals, applications, unfulfilled] = await Promise.all([
    prisma.withdrawal.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.listingApplication.count({ where: { status: "pending" } }),
    prisma.auction.count({ where: { status: "settled", fulfilled: false } }),
  ]);

  const items: {
    id: string;
    count: number;
    title: string;
    href: string;
    tone: "gold" | "portal" | "neon";
  }[] = [];

  if (withdrawals > 0)
    items.push({
      id: "withdrawals",
      count: withdrawals,
      title: `${plural(withdrawals, "payout")} to process`,
      href: "/admin",
      tone: "gold",
    });
  if (applications > 0)
    items.push({
      id: "applications",
      count: applications,
      title: `${plural(applications, "listing application")} to review`,
      href: "/admin",
      tone: "portal",
    });
  if (unfulfilled > 0)
    items.push({
      id: "fulfillment",
      count: unfulfilled,
      title: `${plural(unfulfilled, "won lot")} awaiting delivery`,
      href: "/admin",
      tone: "neon",
    });

  return ok({
    total: withdrawals + applications + unfulfilled,
    counts: { withdrawals, applications, unfulfilled },
    items,
  });
});
