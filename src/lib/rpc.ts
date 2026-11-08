// api.mainnet-beta.solana.com answers many clouds and some browsers with
// HTTP 403. A refused lookup is not a missing account, so try another
// public endpoint before giving up. SOLANA_RPC_URL still wins when it works.
const FALLBACK_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];

export function rpcEndpoints(primary: string): string[] {
  return [...new Set([primary, ...FALLBACK_RPCS].filter(Boolean))];
}

/** fetch() that repeats the JSON-RPC body against the next endpoint on 403/429. */
export function rpcFetch(primary: string): typeof fetch {
  const urls = rpcEndpoints(primary);
  return async (_input, init) => {
    let last: Response | null = null;
    for (const url of urls) {
      const res = await fetch(url, init);
      if (res.status !== 403 && res.status !== 429) return res;
      last = res;
    }
    return last as Response;
  };
}
