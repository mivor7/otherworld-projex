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
  bountyPotShare: Number(process.env.NEXT_PUBLIC_BOUNTY_POT_SHARE ?? 0.5),
  devFaucet: process.env.NEXT_PUBLIC_DEV_FAUCET === "true",
  pumpFunUrl:
    "https://pump.fun/coin/EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump",
  // Meteora liquidity pool, shown alongside PumpSwap wherever trading links
  // appear. Set NEXT_PUBLIC_METEORA_POOL_URL to the pool's page URL; empty
  // hides the link entirely rather than shipping a dead one.
  meteoraUrl:
    process.env.NEXT_PUBLIC_METEORA_POOL_URL ??
    "https://app.meteora.ag/dlmm/7AyDNiDaQbGAeKu6YDh21s6TJgHA3zSSuKh4186hXJsH",
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
