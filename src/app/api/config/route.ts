// Public, live house configuration — the admin can tune these at runtime, so
// clients that price or build transactions MUST read them from here (the
// NEXT_PUBLIC_ values in CLIENT_CONFIG are only build-time fallbacks).
// Notably: use-chain buyCredits fetches the burn/house split from this route
// right before building the split transaction, so a split change can never
// strand a player's payment against a stale ratio.
import { PublicKey } from "@solana/web3.js";
import { handler, ok } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { houseConfig } from "@/lib/settings";
import { connection } from "@/lib/solana";
import { detectTokenProgram } from "@/lib/token-program";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const cfg = await houseConfig();
  let tokenProgram: string | null = null;
  if (CONFIG.ribbitMint) {
    try {
      const program = await detectTokenProgram(connection(), new PublicKey(CONFIG.ribbitMint));
      tokenProgram = program?.toBase58() ?? null;
    } catch {
      tokenProgram = null;
    }
  }
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
    // Where deposits are sent. Falls back to the admin wallet when
    // TREASURY_WALLET is unset — one wallet holds the house.
    treasuryWallet: CONFIG.treasuryWallet,
    // Owner of the $OWP mint account. Null until that account exists.
    tokenProgram,
  });
});
