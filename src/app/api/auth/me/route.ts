import { handler, ok } from "@/lib/api";
import { getSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";
import { getActiveSeed } from "@/lib/fairness";
import { prisma } from "@/lib/db";
import { CONFIG, toRaw } from "@/lib/config";

export const GET = handler(async () => {
  const session = await getSession();
  if (!session) return ok({ signedIn: false });
  const [balances, seed, burned] = await Promise.all([
    getBalances(session.userId),
    getActiveSeed(session.userId),
    prisma.burnEvent.aggregate({
      where: { userId: session.userId },
      _sum: { amountRaw: true },
    }),
  ]);
  return ok({
    signedIn: true,
    wallet: session.wallet,
    isAdmin: isAdminWallet(session.wallet),
    seedHash: seed.seedHash,
    nonce: seed.nonce,
    burnedRaw: burned._sum.amountRaw ?? 0n,
    ranked: (burned._sum.amountRaw ?? 0n) >= toRaw(CONFIG.rankedMinBurnedRibbit),
    ...balances,
  });
});
