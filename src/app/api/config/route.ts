// Public, live house configuration — the admin can tune these at runtime, so
// clients that price or build transactions MUST read them from here (the
// NEXT_PUBLIC_ values in CLIENT_CONFIG are only build-time fallbacks).
// Notably: use-chain buyCredits fetches the burn/house split from this route
// right before building the split transaction, so a split change can never
// strand a player's payment against a stale ratio.
import { handler, ok } from "@/lib/api";
import { houseConfig } from "@/lib/settings";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const cfg = await houseConfig();
  return ok({
    ribbitPerCredit: cfg.ribbitPerCredit,
    buyBurnShare: cfg.buyBurnShare,
    houseEdge: cfg.houseEdge,
    bountyPotShare: cfg.bountyPotShare,
    minWager: cfg.minWager,
    maxWager: cfg.maxWager,
    rankedMinBurnedRibbit: cfg.rankedMinBurnedRibbit,
    rankedMinWindowBurnedRibbit: cfg.rankedMinWindowBurnedRibbit,
    rankedMinTableVolume: cfg.rankedMinTableVolume,
    gamesPaused: cfg.gamesPaused,
    creditSalesPaused: cfg.creditSalesPaused,
    inviteRequired: cfg.inviteRequired,
  });
});
