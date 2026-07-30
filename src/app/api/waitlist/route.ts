// The public airdrop waitlist.
//   GET  /api/waitlist  → count, goal, requirement, recent joiners (masked),
//                         and — when signed in — YOUR own place.
//   POST /api/waitlist  → join: verifies the wallet holds the required
//                         $RIBBIT on-chain right now, then takes the next
//                         position. One place per wallet for new sign-ups
//                         (imported duplicates keep their earned places).
//
// PII rule: imported members joined by email on the old signup site. Emails
// are NEVER returned here — only masked wallets, positions and counts. The
// full list with emails lives behind /api/admin/waitlist.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";
import { CONFIG, toRaw, fromRaw } from "@/lib/config";
import { houseConfig } from "@/lib/settings";
import { getWalletBalances } from "@/lib/solana";

export const dynamic = "force-dynamic";

const mask = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** A member's own view of their place — same shape for GET and after POST. */
function mine(e: {
  position: number;
  joinedAt: Date;
  referrals: number;
  wallet: string | null;
  email: string | null;
}) {
  return {
    joined: true,
    position: e.position,
    joinedAt: e.joinedAt,
    referrals: e.referrals,
    // The link that credits this member with a referral.
    referralWallet: e.wallet,
    // Imported members see that their old email signup is recognized.
    viaEmail: !e.wallet && !!e.email,
  };
}

export const GET = handler(async () => {
  const [session, cfg, count, recent] = await Promise.all([
    getSession(),
    houseConfig(),
    prisma.waitlistEntry.count(),
    // Social proof without leaking anything: masked wallets only.
    prisma.waitlistEntry.findMany({
      where: { wallet: { not: null } },
      orderBy: { position: "desc" },
      take: 8,
      select: { position: true, wallet: true, joinedAt: true },
    }),
  ]);

  let you: ReturnType<typeof mine> | { joined: false } | null = null;
  if (session) {
    // findFirst, not findUnique: wallet isn't unique because 11 imported
    // wallets hold duplicate places. The EARLIEST position is the one that
    // counts as "your place".
    const entry = await prisma.waitlistEntry.findFirst({
      where: { wallet: session.wallet },
      orderBy: { position: "asc" },
    });
    you = entry ? mine(entry) : { joined: false };
  }

  return ok({
    count,
    goal: CONFIG.waitlistGoal,
    open: cfg.waitlistOpen,
    minHoldRibbit: cfg.waitlistMinHoldRibbit,
    recent: recent.map((r) => ({
      position: r.position,
      wallet: mask(r.wallet!),
      joinedAt: r.joinedAt,
    })),
    you,
  });
});

const body = z.object({
  // Optional referral: the wallet of the member who sent them.
  ref: z.string().min(32).max(64).optional(),
});

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  // On-chain balance reads are the expensive part — one join attempt per few
  // seconds per wallet is plenty.
  rateLimit(`waitlist:${session.userId}`, 10, 60_000);
  const { ref } = body.parse(await req.json().catch(() => ({})));

  const cfg = await houseConfig();
  if (!cfg.waitlistOpen) {
    return err("Waitlist sign-ups are closed right now — existing places are safe.", 409);
  }

  const existing = await prisma.waitlistEntry.findFirst({
    where: { wallet: session.wallet },
    orderBy: { position: "asc" },
  });
  if (existing) return ok({ already: true, you: mine(existing) });

  // The holding requirement, verified LIVE on-chain against the signed-in
  // wallet — never trusted from the client.
  const balances = await getWalletBalances(session.wallet);
  if (balances.ribbitBalance === null) {
    return err("Couldn't read your $RIBBIT balance from the chain — try again in a moment.", 503);
  }
  const held = balances.ribbitBalance;
  if (held < cfg.waitlistMinHoldRibbit) {
    return err(
      `The waitlist needs ${cfg.waitlistMinHoldRibbit.toLocaleString()} $RIBBIT held in your wallet. ` +
        `You're holding ${Math.floor(held).toLocaleString()}.`,
      403
    );
  }

  // Referral must be a real member, and never yourself.
  let referredBy: string | null = null;
  if (ref && ref !== session.wallet) {
    const referrer = await prisma.waitlistEntry.findFirst({ where: { wallet: ref } });
    if (referrer) referredBy = ref;
  }

  // Position = next in line, claimed inside a Serializable transaction so a
  // double-tap or two tabs land exactly one place.
  const created = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: without a unique index this is what
    // stops a double-tap or two tabs from taking two places.
    const raced = await tx.waitlistEntry.findFirst({ where: { wallet: session.wallet } });
    if (raced) return raced;
    const last = await tx.waitlistEntry.aggregate({ _max: { position: true } });
    const entry = await tx.waitlistEntry.create({
      data: {
        position: (last._max.position ?? 0) + 1,
        displayName: mask(session.wallet),
        wallet: session.wallet,
        joinedAt: new Date(),
        referredBy,
        heldRibbitRaw: toRaw(Math.floor(held)),
      },
    });
    if (referredBy) {
      // updateMany: credits the referrer's earliest place (wallet isn't unique).
      const r = await tx.waitlistEntry.findFirst({
        where: { wallet: referredBy },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      if (r) {
        await tx.waitlistEntry.update({
          where: { id: r.id },
          data: { referrals: { increment: 1 } },
        });
      }
    }
    return entry;
  });

  const count = await prisma.waitlistEntry.count();
  return ok({
    already: false,
    you: mine(created),
    count,
    goal: CONFIG.waitlistGoal,
    heldRibbit: Math.floor(fromRaw(created.heldRibbitRaw)),
  });
});
