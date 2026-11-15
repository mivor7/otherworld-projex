// Claiming a place on the airdrop waitlist.
import { Prisma, type WaitlistEntry } from "@prisma/client";
import { prisma } from "./db";

export type WaitlistClaim = {
  wallet: string;
  displayName: string;
  /** Wallet of the member who referred them, already checked to be a member. */
  referredBy: string | null;
  heldRibbitRaw: bigint;
};

/**
 * Take the next position for `wallet`, or return the place it already holds.
 *
 * Runs Serializable, so two joins that read the same "last position" cannot
 * both commit: a double-tap lands one place, and two different wallets never
 * share a number. WaitlistEntry.wallet has no unique index (imported members
 * keep their duplicate places), so this transaction is the only guard. The
 * loser of a collision gets a serialization failure and goes again.
 */
export async function claimWaitlistPlace(claim: WaitlistClaim): Promise<WaitlistEntry> {
  const attempt = () =>
    prisma.$transaction(
      async (tx) => {
        const existing = await tx.waitlistEntry.findFirst({
          where: { wallet: claim.wallet },
          orderBy: { position: "asc" },
        });
        if (existing) return existing;
        const last = await tx.waitlistEntry.aggregate({ _max: { position: true } });
        const entry = await tx.waitlistEntry.create({
          data: {
            position: (last._max.position ?? 0) + 1,
            displayName: claim.displayName,
            wallet: claim.wallet,
            joinedAt: new Date(),
            referredBy: claim.referredBy,
            heldRibbitRaw: claim.heldRibbitRaw,
          },
        });
        if (claim.referredBy) {
          // Credits the referrer's earliest place (wallet isn't unique).
          const referrer = await tx.waitlistEntry.findFirst({
            where: { wallet: claim.referredBy },
            orderBy: { position: "asc" },
            select: { id: true },
          });
          if (referrer) {
            await tx.waitlistEntry.update({
              where: { id: referrer.id },
              data: { referrals: { increment: 1 } },
            });
          }
        }
        return entry;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  for (let tries = 0; ; tries++) {
    try {
      return await attempt();
    } catch (e) {
      // P2034 = write conflict / serialization failure. Anything else is real.
      const conflict =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!conflict || tries >= 8) throw e;
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (tries + 1)));
    }
  }
}
