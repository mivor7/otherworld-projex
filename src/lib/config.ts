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

// One wallet runs the house: the admin wallet is also the treasury that
// receives deposits and the payout signer that sends withdrawals. An explicit
// TREASURY_WALLET / PAYOUT_WALLET still wins if it is set.
const adminWallet = (process.env.ADMIN_WALLETS ?? "")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean)[0] ?? "";
const treasuryWallet = process.env.TREASURY_WALLET || adminWallet;

export const CONFIG = {
  appName: "Other World Projex",
  ticker: "$OWP",

  // $OWP mint. Empty until launch — set OWP_MINT. There is no baked-in
  // address: the retired Ribbit mint must never be implied.
  // Field name `ribbitMint` is the historical identifier; the value is $OWP.
  ribbitMint: process.env.OWP_MINT ?? "",
  ribbitDecimals: num(process.env.OWP_DECIMALS ?? process.env.RIBBIT_DECIMALS, 6),

  rpcUrl:
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",

  // Public key of the house wallet. Deposits land here and withdrawals
  // leave from here. Falls back to the first ADMIN_WALLETS entry.
  treasuryWallet,

  // Same wallet, unless PAYOUT_WALLET is set to something else. Public key
  // only on the web server — the private key lives on the payout box.
  payoutWallet: process.env.PAYOUT_WALLET || treasuryWallet,

  // Streamflow staking pool for $OWP (public account address, READ-ONLY).
  // Empty until a pool exists — staking then shows "not live" instead of
  // another token's pool. The app never holds staked funds.
  stakePool: process.env.STAKE_POOL_ADDRESS ?? "",

  // Burn-to-play: how many whole $OWP one play credit costs.
  // OWP_PER_CREDIT wins; RIBBIT_PER_CREDIT still reads so an existing
  // host doesn't reset the price on deploy.
  ribbitPerCredit: num(process.env.OWP_PER_CREDIT ?? process.env.RIBBIT_PER_CREDIT, 100),

  // House edge applied to game payouts (0.04 = 4%).
  houseEdge: Math.min(0.15, Math.max(0.005, num(process.env.HOUSE_EDGE, 0.04))),

  // Wager limits, in whole $OWP.
  minWager: num(process.env.MIN_WAGER, 1),
  maxWager: num(process.env.MAX_WAGER, 1_000),

  // Sybil economics: prize leaderboards only rank wallets with skin in the
  // game. Eligibility = lifetime deposits ≥ this many whole $OWP;
  // table boards additionally require this many whole $OWP wagered in-window.
  rankedMinBurnedRibbit: nonneg(
    process.env.OWP_RANKED_MIN_BURNED ?? process.env.RANKED_MIN_BURNED_RIBBIT,
    1_000
  ),
  rankedMinTableVolume: nonneg(process.env.RANKED_MIN_TABLE_VOLUME, 100),

  // Airdrop waitlist: on-site signups need this much $OWP held on-chain
  // (whole tokens), and the list can be closed with a switch. The airdrop is
  // guaranteed once the list reaches WAITLIST_GOAL members.
  waitlistMinHoldRibbit: nonneg(
    process.env.OWP_WAITLIST_MIN_HOLD ?? process.env.WAITLIST_MIN_HOLD_RIBBIT,
    250_000
  ),
  waitlistGoal: nonneg(process.env.WAITLIST_GOAL, 1000),
  waitlistOpen: process.env.WAITLIST_OPEN !== "false",
  // Fresh-deposit rule: prize eligibility additionally requires this many
  // whole $OWP deposited INSIDE the board/bounty window. Splitting play
  // across N sybil wallets therefore costs N× fresh deposits every window.
  rankedMinWindowBurnedRibbit: nonneg(
    process.env.OWP_RANKED_MIN_WINDOW_BURNED ??
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

  // Retired with chip sales. Deposits credit the full amount. Kept so an
  // old HouseSetting row still has a default.
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
  // so the house's real $OWP revenue from selling those credits (the
  // buy-split share) covers the prize PLUS this margin. 0.5 = the house nets
  // ~1.5× the prize before paying. Higher = more margin / slower payouts. The
  // house EDGE is unrelated to this.
  // Share of the realized house edge that fills bounty pots (0.5 = pot gets
  // half, house keeps half). Replaces the old bountyHouseMargin, which scaled
  // a wager threshold and could never track real revenue.
  bountyPotShare: nonneg(process.env.BOUNTY_POT_SHARE, 0.5),

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

/** Convert whole $OWP to raw token units. */
export function toRaw(ribbit: number): bigint {
  return BigInt(Math.round(ribbit * 10 ** CONFIG.ribbitDecimals));
}

/** Convert raw token units to whole $OWP for display. */
export function fromRaw(raw: bigint): number {
  return Number(raw) / 10 ** CONFIG.ribbitDecimals;
}
