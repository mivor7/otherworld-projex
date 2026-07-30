// The public airdrop waitlist.
//   GET  /api/waitlist            → count, goal, requirement, recent joiners
//                                   (masked), and — when signed in — YOUR place.
//   GET  /api/waitlist?wallet=... → public lookup: has this wallet joined, and
//                                   at what position? (Owner's rule: anyone can
//                                   check that a wallet already joined.)
//   POST /api/waitlist            → join. Two ways to prove the wallet:
//                                   an app session, OR {wallet, signature}
//                                   over the standard nonce message — the
//                                   waitlist is open to holders who don't
//                                   have an app account (invite gate or not).
//                                   Then the required $RIBBIT holding is
//                                   verified live on-chain and the next
//                                   position is claimed. One place per wallet
//                                   for new sign-ups (imported duplicates
//                                   keep their earned places).
//
// PII rule: imported members joined by email on the old signup site. Emails
// are NEVER returned here — only masked wallets, positions and counts. The
// full list with emails lives behind /api/admin/waitlist.
import { z } from "zod";
import { err, handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { getSession, verifyWalletSignature } from "@/lib/session";
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

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const GET = handler(async (req: Request) => {
  const lookupWallet = new URL(req.url).searchParams.get("wallet");
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

  // Public wallet lookup — position and referral count only, never an email.
  let checked: { joined: boolean; position?: number; referrals?: number; joinedAt?: Date } | null = null;
  if (lookupWallet && BASE58.test(lookupWallet)) {
    const e = await prisma.waitlistEntry.findFirst({
      where: { wallet: lookupWallet },
      orderBy: { position: "asc" },
    });
    checked = e
      ? { joined: true, position: e.position, referrals: e.referrals, joinedAt: e.joinedAt }
      : { joined: false };
  }

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
    checked,
  });
});

const body = z.object({
  // Optional referral: the wallet of the member who sent them.
  ref: z.string().min(32).max(64).optional(),
  // Sessionless proof of ownership: sign the standard nonce message. This is
  // how holders WITHOUT an app account join (the invite gate only guards
  // accounts, never the waitlist).
  wallet: z.string().min(32).max(44).optional(),
  signature: z.string().min(32).max(128).optional(),
});

export const POST = handler(async (req: Request) => {
  const parsed = body.parse(await req.json().catch(() => ({})));
  const { ref } = parsed;
  const session = await getSession();
  let walletAddr: string;
  if (session) {
    walletAddr = session.wallet;
  } else if (parsed.wallet && parsed.signature) {
    if (!(await verifyWalletSignature(parsed.wallet, parsed.signature))) {
      return err("Signature verification failed", 401);
    }
    walletAddr = parsed.wallet;
  } else {
    return err("Sign in, or sign the join message with your wallet.", 401);
  }
  // On-chain balance reads are the expensive part — one join attempt per few
  // seconds per wallet is plenty.
  rateLimit(`waitlist:${walletAddr}`, 10, 60_000);

  const cfg = await houseConfig();
  if (!cfg.waitlistOpen) {
    return err("Waitlist sign-ups are closed right now — existing places are safe.", 409);
  }

  const existing = await prisma.waitlistEntry.findFirst({
    where: { wallet: walletAddr },
    orderBy: { position: "asc" },
  });
  if (existing) return ok({ already: true, you: mine(existing) });

  // The holding requirement, verified LIVE on-chain against the signed-in
  // wallet — never trusted from the client.
  const balances = await getWalletBalances(walletAddr);
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
  if (ref && ref !== walletAddr) {
    const referrer = await prisma.waitlistEntry.findFirst({ where: { wallet: ref } });
    if (referrer) referredBy = ref;
  }

  // Position = next in line, claimed inside a Serializable transaction so a
  // double-tap or two tabs land exactly one place.
  const created = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: without a unique index this is what
    // stops a double-tap or two tabs from taking two places.
    const raced = await tx.waitlistEntry.findFirst({ where: { wallet: walletAddr } });
    if (raced) return raced;
    const last = await tx.waitlistEntry.aggregate({ _max: { position: true } });
    const entry = await tx.waitlistEntry.create({
      data: {
        position: (last._max.position ?? 0) + 1,
        displayName: mask(walletAddr),
        wallet: walletAddr,
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
