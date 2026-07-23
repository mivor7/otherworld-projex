// Central configuration. Everything security-relevant is env-driven so the
// same code runs in local demo mode and in production on Vercel.

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Like num(), but 0 is a valid value (e.g. to disable a threshold).
const nonneg = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const CONFIG = {
  appName: "Other World Projex",
  ticker: "$RIBBIT",

  // $RIBBIT mint (pump.fun launch). Override with RIBBIT_MINT if it migrates.
  ribbitMint:
    process.env.RIBBIT_MINT ?? "EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump",
  ribbitDecimals: num(process.env.RIBBIT_DECIMALS, 6),

  rpcUrl:
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",

  // Public key of the treasury (ideally the Anchor vault PDA or a Squads
  // multisig — see program/README.md). Auction deposits and the dashboard
  // read against this address.
  treasuryWallet: process.env.TREASURY_WALLET ?? "",

  // Public address of the payout hot wallet (the worker's signer). PUBLIC key
  // ONLY — the private key never leaves the worker box. Set so the admin panel
  // can display the float that actually pays withdrawals/prizes.
  payoutWallet: process.env.PAYOUT_WALLET ?? "",

  // Burn-to-play: how many whole $RIBBIT one play credit costs.
  ribbitPerCredit: num(process.env.RIBBIT_PER_CREDIT, 100),

  // House edge applied to game payouts (0.04 = 4%).
  houseEdge: Math.min(0.15, Math.max(0.005, num(process.env.HOUSE_EDGE, 0.04))),

  // Wager limits, in credits.
  minWager: num(process.env.MIN_WAGER, 1),
  maxWager: num(process.env.MAX_WAGER, 1_000),

  // Sybil economics: prize leaderboards only rank wallets with skin in the
  // game. Eligibility = lifetime verified burns ≥ this many whole $RIBBIT;
  // table boards additionally require this many credits wagered in-window.
  rankedMinBurnedRibbit: nonneg(process.env.RANKED_MIN_BURNED_RIBBIT, 1_000),
  rankedMinTableVolume: nonneg(process.env.RANKED_MIN_TABLE_VOLUME, 100),
  // Active-burner rule: prize eligibility additionally requires this many
  // whole $RIBBIT burned INSIDE the board/bounty window. Splitting play
  // across N sybil wallets therefore costs N× fresh burns every window.
  rankedMinWindowBurnedRibbit: nonneg(
    process.env.RANKED_MIN_WINDOW_BURNED_RIBBIT,
    100
  ),
  // Admin guidance only: the share of realized house take shown as a safe
  // weekly budget for MANUAL bounty prizes. Auto-pay bounties don't need it —
  // their triggers already price in the margin.
  bountyPoolShare: Math.min(
    1,
    Math.max(0, nonneg(process.env.BOUNTY_POOL_SHARE, 0.3))
  ),
  // Max arcade score submissions per wallet per game per UTC day.
  arcadeDailySubmissions: num(process.env.ARCADE_DAILY_SUBMISSIONS, 40),

  // Buy-credits: paying $RIBBIT for credits splits into a burned portion
  // (deflation) and a house portion (real treasury revenue). This is the
  // fraction burned; the rest goes to the treasury. Buying is only offered
  // when TREASURY_WALLET is set (there must be somewhere to send the house
  // cut). Pure burn-for-credits stays available regardless.
  buyBurnShare: Math.min(1, Math.max(0, nonneg(process.env.BUY_BURN_SHARE, 0.5))),

  // Auto-bounties: when enabled, credit-game bounties pay out on their own
  // once cumulative credits wagered on the game reach the trigger, and
  // free-game bounties pay weekly — every eligible winner pro-rata. Off by
  // default so nothing pays until the owner sets prizes + thresholds.
  bountyAutoPayEnabled: process.env.BOUNTY_AUTO_PAY === "true",
  // Invite-only sign-ups (new wallets need a code). Env default only — the
  // live switch is the "inviteRequired" house setting.
  inviteRequired: process.env.INVITE_REQUIRED === "true",

  // Auto-derived trigger: a credit-game bounty's required credit-spend is set
  // so the house's real $RIBBIT revenue from selling those credits (the
  // buy-split share) covers the prize PLUS this margin. 0.5 = the house nets
  // ~1.5× the prize before paying. Higher = more margin / slower payouts. The
  // house EDGE is unrelated to this.
  bountyHouseMargin: nonneg(process.env.BOUNTY_HOUSE_MARGIN, 0.5),

  adminWallets: (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean),

  sessionSecret: process.env.SESSION_SECRET ?? "",

  // When true, /api/dev/faucet grants free demo credits (local dev only).
  devFaucet: process.env.DEV_FAUCET === "true",
} as const;

export function requireSessionSecret(): string {
  if (CONFIG.sessionSecret) return CONFIG.sessionSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return "owp-dev-secret-do-not-use-in-prod";
}

/** Convert whole $RIBBIT to raw token units. */
export function toRaw(ribbit: number): bigint {
  return BigInt(Math.round(ribbit * 10 ** CONFIG.ribbitDecimals));
}

/** Convert raw token units to whole $RIBBIT for display. */
export function fromRaw(raw: bigint): number {
  return Number(raw) / 10 ** CONFIG.ribbitDecimals;
}
