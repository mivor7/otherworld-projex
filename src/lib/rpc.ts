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

// Without a deadline a stalled endpoint holds a request (and a serverless
// invocation) open until the platform kills it.
const RPC_TIMEOUT_MS = 15_000;

// This file also runs in the browser (wallet connection). A WebView too old
// to have AbortSignal.timeout simply goes without the deadline.
function deadline(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(RPC_TIMEOUT_MS)
    : undefined;
}

/**
 * fetch() that repeats the JSON-RPC body against the next endpoint when one
 * refuses (403/429), stalls, or cannot be reached.
 */
export function rpcFetch(primary: string): typeof fetch {
  const urls = rpcEndpoints(primary);
  return async (_input, init) => {
    let last: Response | null = null;
    let failure: unknown = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { ...init, signal: deadline() });
        if (res.status !== 403 && res.status !== 429) return res;
        last = res;
      } catch (e) {
        failure = e;
      }
    }
    if (last) return last;
    throw failure ?? new Error("No Solana RPC endpoint answered");
  };
}
