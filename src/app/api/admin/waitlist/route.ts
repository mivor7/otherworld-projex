// The airdrop waitlist, for the admin console. Positions and referral counts
// are members' EARNED place (imported snapshot — scripts/import-waitlist.mjs);
// signup required holding 250k $RIBBIT; the airdrop is guaranteed once the
// list reaches 1,000 members (amount TBA by the owners). PII (emails) is
// admin-gated — this list must never appear on a public surface.
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { position: "asc" },
    take: 1000,
  });
  return ok({
    count: entries.length,
    goal: 1000,
    entries: entries.map((e) => ({
      position: e.position,
      displayName: e.displayName,
      email: e.email,
      wallet: e.wallet,
      joinedAt: e.joinedAt,
      referrals: e.referrals,
      referredBy: e.referredBy,
    })),
  });
});
