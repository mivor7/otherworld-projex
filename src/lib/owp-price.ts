// Live $OWP price from the Raydium LaunchLab pool. The house sells from its
// own wallet at this spot — the buyer's SOL is not routed through the pool.
// Layout matches @raydium-io/raydium-sdk-v2 LaunchpadPool (8-byte disc, then
// the fields below). A pool is quoted only when it is owned by LaunchLab,
// mintA is this mint, mintB is wSOL, and the config curve is constant-product.
import { PublicKey } from "@solana/web3.js";
import { CONFIG } from "./config";
import { owpRawForQuote } from "./owp-quote";
import { connection, getTreasuryStats } from "./solana";
import { tokenProgramId } from "./token-program";

const LAUNCHPAD = new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

// LaunchpadPool field offsets, after the 8-byte discriminator.
const STATUS = 17;
const DECIMALS_A = 18;
const DECIMALS_B = 19;
const VIRTUAL_A = 37;
const VIRTUAL_B = 45;
const REAL_A = 53;
const REAL_B = 61;
const CONFIG_ID = 141;
const MINT_A = 205;
const MINT_B = 237;
const MIN_POOL_LEN = 365;
// LaunchpadConfig: curve type at byte 16, quote mint at byte 83.
const CONFIG_CURVE = 16;
const CONFIG_MINT_B = 83;
const CONSTANT_PRODUCT = 0;
const MAX_QUOTE_LAMPORTS = 1_000_000n * 1_000_000_000n;

export type OwpQuote = {
  available: true;
  mint: string;
  decimals: number;
  /** Ceiled lamports of SOL for 1 whole $OWP. Display only when reserves are set. */
  lamportsPerWhole: string;
  solPerToken: number;
  source: "launchpad" | "market";
  complete: boolean;
  /** Set while the launchpad pool is still funding. Payout is lamports * virtualToken / virtualSol. */
  virtualToken: string | null;
  virtualSol: string | null;
  houseOwp: number | null;
  treasuryWallet: string;
};

export type OwpQuoteMiss = {
  available: false;
  mint: string;
  reason: string;
  treasuryWallet: string;
};

const cache: { at: number; value: OwpQuote | OwpQuoteMiss | null } = { at: 0, value: null };
const TTL_MS = 10_000;

export { owpRawForQuote };

export type LaunchpadRead =
  | {
      kind: "curve";
      virtualToken: bigint;
      virtualSol: bigint;
      lamportsPerWhole: bigint;
      configId: PublicKey;
    }
  | { kind: "graduated" }
  | { kind: "reject" };

function readU64(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(offset, true);
}

function readKey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

/** Decode a LaunchpadPool. curveType comes from that pool's LaunchpadConfig. */
export function decodeLaunchpadPool(
  data: Uint8Array,
  mint: PublicKey,
  decimals: number,
  curveType: number
): LaunchpadRead {
  if (data.length < MIN_POOL_LEN || decimals < 0 || decimals > 18) return { kind: "reject" };
  if (!readKey(data, MINT_A).equals(mint)) return { kind: "reject" };
  if (!readKey(data, MINT_B).equals(WSOL)) return { kind: "reject" };
  if (data[DECIMALS_A] !== decimals || data[DECIMALS_B] !== 9) return { kind: "reject" };
  const status = data[STATUS];
  if (status === 1 || status === 2) return { kind: "graduated" };
  if (status !== 0 || curveType !== CONSTANT_PRODUCT) return { kind: "reject" };

  const virtualA = readU64(data, VIRTUAL_A);
  const virtualB = readU64(data, VIRTUAL_B);
  const realA = readU64(data, REAL_A);
  const realB = readU64(data, REAL_B);
  if (virtualA <= realA) return { kind: "reject" };
  const virtualToken = virtualA - realA;
  const virtualSol = virtualB + realB;
  if (virtualToken <= 0n || virtualSol <= 0n || virtualSol > MAX_QUOTE_LAMPORTS) return { kind: "reject" };
  const scale = 10n ** BigInt(decimals);
  const lamportsPerWhole = (virtualSol * scale + virtualToken - 1n) / virtualToken;
  if (lamportsPerWhole <= 0n) return { kind: "reject" };
  return {
    kind: "curve",
    virtualToken,
    virtualSol,
    lamportsPerWhole,
    configId: readKey(data, CONFIG_ID),
  };
}

function poolPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mint.toBuffer(), WSOL.toBuffer()],
    LAUNCHPAD
  )[0];
}

function solPerTokenFromLamports(lamportsPerWhole: bigint): number {
  return Number(lamportsPerWhole) / 1_000_000_000;
}

/** Ceil a SOL price string to whole lamports so a short quote cannot overpay. */
function lamportsPerWholeCeil(priceNative: string): bigint | null {
  const [whole, frac = ""] = priceNative.split(".");
  if (!/^\d+$/.test(whole) || (frac !== "" && !/^\d+$/.test(frac))) return null;
  const digits = (frac + "000000000").slice(0, 9);
  const rest = frac.slice(9);
  let lamports = BigInt(whole) * 1_000_000_000n + BigInt(digits || "0");
  if ([...rest].some((c) => c !== "0")) lamports += 1n;
  return lamports > 0n ? lamports : null;
}

async function dexscreenerLamportsPerWhole(mint: string): Promise<bigint | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      pairs?: { priceNative?: string; quoteToken?: { symbol?: string } }[] | null;
    };
    const pair = (body.pairs ?? []).find((p) => p.quoteToken?.symbol === "SOL" && p.priceNative);
    if (!pair?.priceNative) return null;
    return lamportsPerWholeCeil(pair.priceNative);
  } catch {
    return null;
  }
}

async function configCurveType(configId: PublicKey): Promise<number | null> {
  const info = await connection().getAccountInfo(configId);
  if (!info || !info.owner.equals(LAUNCHPAD) || info.data.length < CONFIG_MINT_B + 32) return null;
  const quote = new PublicKey(info.data.subarray(CONFIG_MINT_B, CONFIG_MINT_B + 32));
  if (!quote.equals(WSOL)) return null;
  return info.data[CONFIG_CURVE];
}

async function readPool(
  mint: PublicKey,
  decimals: number
): Promise<LaunchpadRead | { kind: "missing" }> {
  const info = await connection().getAccountInfo(poolPda(mint));
  if (!info) return { kind: "missing" };
  if (!info.owner.equals(LAUNCHPAD)) return { kind: "reject" };
  // Curve type is filled in after this check when the pool is still funding.
  const first = decodeLaunchpadPool(info.data, mint, decimals, CONSTANT_PRODUCT);
  if (first.kind !== "curve") return first;
  const curveType = await configCurveType(first.configId);
  if (curveType === null) return { kind: "reject" };
  return decodeLaunchpadPool(info.data, mint, decimals, curveType);
}

async function mintDecimals(mint: PublicKey): Promise<number | null> {
  const info = await connection().getAccountInfo(mint);
  if (!info || info.data.length < 45 || !tokenProgramId(info.owner)) return null;
  const decimals = info.data[44];
  if (decimals > 18) return null;
  return decimals;
}

/** Current Raydium spot price, plus how much $OWP the house wallet can pay. */
export async function owpQuote(opts?: { fresh?: boolean }): Promise<OwpQuote | OwpQuoteMiss> {
  if (!opts?.fresh && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const mint = CONFIG.ribbitMint;
  const treasuryWallet = CONFIG.treasuryWallet;
  const miss = (reason: string): OwpQuoteMiss => ({
    available: false,
    mint,
    reason,
    treasuryWallet,
  });
  if (!mint) return miss("The $OWP mint is not set.");
  if (!treasuryWallet) return miss("The house wallet is not set.");

  let value: OwpQuote | OwpQuoteMiss;
  try {
    const mintKey = new PublicKey(mint);
    const decimals = await mintDecimals(mintKey);
    if (decimals === null) {
      value = miss("This mint is not on Solana mainnet yet, so there is no Raydium price.");
    } else {
      const pool = await readPool(mintKey, decimals);
      let lamportsPerWhole: bigint | null = null;
      let source: OwpQuote["source"] = "launchpad";
      let complete = false;
      let virtualToken: bigint | null = null;
      let virtualSol: bigint | null = null;
      if (pool.kind === "curve") {
        lamportsPerWhole = pool.lamportsPerWhole;
        virtualToken = pool.virtualToken;
        virtualSol = pool.virtualSol;
      } else if (pool.kind === "graduated") {
        const dex = await dexscreenerLamportsPerWhole(mint);
        complete = true;
        if (dex) {
          lamportsPerWhole = dex;
          source = "market";
        }
      }
      if (!lamportsPerWhole) {
        value = miss(
          pool.kind === "graduated"
            ? "The launchpad pool has migrated and there is no Raydium market price yet."
            : pool.kind === "reject"
              ? "This Raydium pool is not a SOL constant-product launch, so there is no price."
              : "No Raydium launchpad price for this mint yet."
        );
      } else {
        const stats = await getTreasuryStats();
        const solPerToken =
          virtualSol && virtualToken
            ? (Number(virtualSol) / Number(virtualToken)) * 10 ** decimals / 1_000_000_000
            : solPerTokenFromLamports(lamportsPerWhole);
        value = {
          available: true,
          mint,
          decimals,
          lamportsPerWhole: lamportsPerWhole.toString(),
          solPerToken,
          source,
          complete,
          virtualToken: virtualToken?.toString() ?? null,
          virtualSol: virtualSol?.toString() ?? null,
          houseOwp: stats.ribbitBalance,
          treasuryWallet,
        };
      }
    }
  } catch {
    value = miss("Could not read the Raydium price. Try again in a moment.");
  }
  cache.at = Date.now();
  cache.value = value;
  return value;
}
