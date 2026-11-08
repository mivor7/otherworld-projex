// Live $OWP price from the pump.fun bonding curve. The house sells from its
// own wallet at this spot — the buyer's SOL is not routed through the curve.
import { PublicKey } from "@solana/web3.js";
import { CONFIG } from "./config";
import { owpRawForQuote } from "./owp-quote";
import { connection, getTreasuryStats } from "./solana";
import { tokenProgramId } from "./token-program";

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
// sha256("account:BondingCurve")[0..8]
const BONDING_CURVE_DISC = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);

export type PumpQuote = {
  available: true;
  mint: string;
  decimals: number;
  /** Ceiled lamports of SOL for 1 whole $OWP. Display only when reserves are set. */
  lamportsPerWhole: string;
  solPerToken: number;
  source: "bonding-curve" | "pump-amm";
  complete: boolean;
  /** Set for an open SOL bonding curve. The payout is lamports * virtualToken / virtualSol. */
  virtualToken: string | null;
  virtualSol: string | null;
  houseOwp: number | null;
  treasuryWallet: string;
};

export type PumpQuoteMiss = {
  available: false;
  mint: string;
  reason: string;
  treasuryWallet: string;
};

const cache: { at: number; value: PumpQuote | PumpQuoteMiss | null } = { at: 0, value: null };
const TTL_MS = 10_000;

export { owpRawForQuote };

function curvePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM
  )[0];
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
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

async function readCurve(mint: PublicKey, decimals: number): Promise<{
  virtualToken: bigint;
  virtualSol: bigint;
  lamportsPerWhole: bigint;
  complete: boolean;
} | null> {
  const info = await connection().getAccountInfo(curvePda(mint));
  if (!info || !info.owner.equals(PUMP_PROGRAM) || info.data.length < 49) return null;
  if (!info.data.subarray(0, 8).equals(BONDING_CURVE_DISC)) return null;
  const virtualToken = readU64(info.data, 8);
  const virtualSol = readU64(info.data, 16);
  const complete = info.data[48] === 1;
  if (virtualToken <= 0n || virtualSol <= 0n) return null;
  // A broken decode (price of ~0, or a quote that is not SOL) must not size a payout.
  if (virtualSol > 1_000_000n * 1_000_000_000n) return null;
  // Trailing fields, when the account has been extended:
  // creator pubkey @ 49, is_mayhem_mode @ 81, is_cashback_coin @ 82, quote_mint @ 83.
  // Shorter accounts predate quote_mint; those are SOL.
  if (info.data.length >= 115) {
    const quote = new PublicKey(info.data.subarray(83, 115));
    if (!quote.equals(PublicKey.default)) return null;
  }
  const scale = 10n ** BigInt(decimals);
  const lamportsPerWhole = (virtualSol * scale + virtualToken - 1n) / virtualToken;
  if (lamportsPerWhole <= 0n) return null;
  return { virtualToken, virtualSol, lamportsPerWhole, complete };
}

async function mintDecimals(mint: PublicKey): Promise<number | null> {
  const info = await connection().getAccountInfo(mint);
  if (!info || info.data.length < 45 || !tokenProgramId(info.owner)) return null;
  const decimals = info.data[44];
  if (decimals > 18) return null;
  return decimals;
}

/** Current pump.fun spot price, plus how much $OWP the house wallet can pay. */
export async function pumpQuote(opts?: { fresh?: boolean }): Promise<PumpQuote | PumpQuoteMiss> {
  if (!opts?.fresh && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const mint = CONFIG.ribbitMint;
  const treasuryWallet = CONFIG.treasuryWallet;
  const miss = (reason: string): PumpQuoteMiss => ({
    available: false,
    mint,
    reason,
    treasuryWallet,
  });
  if (!mint) return miss("The $OWP mint is not set.");
  if (!treasuryWallet) return miss("The house wallet is not set.");

  let value: PumpQuote | PumpQuoteMiss;
  try {
    const mintKey = new PublicKey(mint);
    const decimals = await mintDecimals(mintKey);
    if (decimals === null) {
      value = miss("This mint is not on Solana mainnet yet, so there is no pump.fun price.");
    } else {
      const curve = await readCurve(mintKey, decimals);
      let lamportsPerWhole = curve && !curve.complete ? curve.lamportsPerWhole : null;
      let source: PumpQuote["source"] = "bonding-curve";
      let complete = curve?.complete ?? false;
      let virtualToken: bigint | null = curve && !curve.complete ? curve.virtualToken : null;
      let virtualSol: bigint | null = curve && !curve.complete ? curve.virtualSol : null;
      if (!curve || curve.complete) {
        const dex = await dexscreenerLamportsPerWhole(mint);
        if (dex) {
          lamportsPerWhole = dex;
          virtualToken = null;
          virtualSol = null;
          source = "pump-amm";
          complete = true;
        } else if (curve?.complete) {
          lamportsPerWhole = null;
        }
      }
      if (!lamportsPerWhole) {
        value = miss(
          curve?.complete
            ? "The bonding curve has migrated and there is no PumpSwap price yet."
            : "No pump.fun price for this mint yet."
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
    value = miss("Could not read the pump.fun price. Try again in a moment.");
  }
  cache.at = Date.now();
  cache.value = value;
  return value;
}
