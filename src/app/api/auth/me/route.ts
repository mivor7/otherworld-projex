import { handler, ok } from "@/lib/api";
import { getSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";
import { getActiveSeed } from "@/lib/fairness";
import { toRaw } from "@/lib/config";
import { burnTotals } from "@/lib/ranked";
import { houseConfig } from "@/lib/settings";

export const GET = handler(async () => {
  const session = await getSession();
  if (!session) return ok({ signedIn: false });
  const [balances, seed, spendTotals, cfg] = await Promise.all([
    getBalances(session.userId),
    getActiveSeed(session.userId),
    burnTotals([session.userId]), // burns + buys — same rule the boards use
    houseConfig(),
  ]);
  const spentRaw = spendTotals.get(session.userId) ?? 0n;
  return ok({
    signedIn: true,
    wallet: session.wallet,
    isAdmin: isAdminWallet(session.wallet),
    seedHash: seed.seedHash,
    nonce: seed.nonce,
    burnedRaw: spentRaw,
    ranked: spentRaw >= toRaw(cfg.rankedMinBurnedRibbit),
    ...balances,
  });
});
