// Client-side config (NEXT_PUBLIC_*). Mirrors src/lib/config.ts defaults —
// keep the two in sync when overriding via env.
export const CLIENT_CONFIG = {
  ribbitMint:
    process.env.NEXT_PUBLIC_RIBBIT_MINT ??
    "EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump",
  ribbitDecimals: Number(process.env.NEXT_PUBLIC_RIBBIT_DECIMALS ?? 6),
  rpcUrl:
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com",
  treasuryWallet: process.env.NEXT_PUBLIC_TREASURY_WALLET ?? "",
  ribbitPerCredit: Number(process.env.NEXT_PUBLIC_RIBBIT_PER_CREDIT ?? 100),
  rankedMinBurnedRibbit: Number(process.env.NEXT_PUBLIC_RANKED_MIN_BURNED_RIBBIT ?? 1_000),
  rankedMinWindowBurnedRibbit: Number(
    process.env.NEXT_PUBLIC_RANKED_MIN_WINDOW_BURNED_RIBBIT ?? 100
  ),
  buyBurnShare: Math.min(
    1,
    Math.max(0, Number(process.env.NEXT_PUBLIC_BUY_BURN_SHARE ?? 0.5))
  ),
  houseEdge: Number(process.env.NEXT_PUBLIC_HOUSE_EDGE ?? 0.04),
  bountyHouseMargin: Number(process.env.NEXT_PUBLIC_BOUNTY_HOUSE_MARGIN ?? 0.5),
  devFaucet: process.env.NEXT_PUBLIC_DEV_FAUCET === "true",
  pumpFunUrl:
    "https://pump.fun/coin/EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump",
  xUrl: "https://x.com/OWProjex",
} as const;

export function toRawClient(ribbit: number): bigint {
  return BigInt(Math.round(ribbit * 10 ** CLIENT_CONFIG.ribbitDecimals));
}

export function fromRawClient(raw: bigint | string | number): number {
  return Number(raw) / 10 ** CLIENT_CONFIG.ribbitDecimals;
}

export function fmtRibbit(raw: bigint | string | number): string {
  return fromRawClient(raw).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function shortWallet(w: string): string {
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

// ── Lily Pad Drop (plinko) ──
// A symmetric BASE multiplier per bucket; the real payouts are these scaled so
// the house edge is exactly houseEdge whatever the shape. Shared by the server
// resolver (src/lib/games.ts) and the game page so the two never drift.
export const PLINKO_ROWS = 12;
export const PLINKO_BASE = [16, 6, 3, 1.6, 1.2, 0.8, 0.5, 0.8, 1.2, 1.6, 3, 6, 16];
function binom(n: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}
export function plinkoTable(edge: number): number[] {
  const n = PLINKO_ROWS;
  let ev = 0;
  for (let k = 0; k <= n; k++) ev += (binom(n, k) / 2 ** n) * PLINKO_BASE[k];
  const scale = (1 - edge) / ev; // normalise so expected return = 1 − edge
  return PLINKO_BASE.map((m) => m * scale);
}
