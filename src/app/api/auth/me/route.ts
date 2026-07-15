import { handler, ok } from "@/lib/api";
import { getSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";
import { getActiveSeed } from "@/lib/fairness";

export const GET = handler(async () => {
  const session = await getSession();
  if (!session) return ok({ signedIn: false });
  const [balances, seed] = await Promise.all([
    getBalances(session.userId),
    getActiveSeed(session.userId),
  ]);
  return ok({
    signedIn: true,
    wallet: session.wallet,
    isAdmin: isAdminWallet(session.wallet),
    seedHash: seed.seedHash,
    nonce: seed.nonce,
    ...balances,
  });
});
