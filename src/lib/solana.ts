// On-chain verification helpers. The server never holds user keys — users
// sign deposits and SOL payments in their own wallet, then submit the tx
// signature here for verification against the configured RPC.
import {
  Connection,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CONFIG } from "./config";
import { rpcFetch } from "./rpc";
import { detectTokenProgram } from "./token-program";

// SOL a website buy will accept. The house prices the $OWP; the buyer pays SOL.
export const MIN_BUY_LAMPORTS = 10_000_000n; // 0.01 SOL
export const MAX_BUY_LAMPORTS = 50_000_000_000n; // 50 SOL

let _conn: Connection | null = null;
export function connection(): Connection {
  if (!_conn) {
    _conn = new Connection(CONFIG.rpcUrl, {
      commitment: "confirmed",
      fetch: rpcFetch(CONFIG.rpcUrl),
    });
  }
  return _conn;
}

const TOKEN_PROGRAM_IDS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // spl-token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // token-2022
]);

function parsedInstructions(tx: Awaited<ReturnType<Connection["getParsedTransaction"]>>) {
  if (!tx) return [];
  const top = tx.transaction.message.instructions;
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions);
  return [...top, ...inner].filter(
    (ix): ix is ParsedInstruction =>
      "parsed" in ix && TOKEN_PROGRAM_IDS.has(ix.programId.toBase58())
  );
}

async function getVerifiedTx(signature: string) {
  const tx = await connection().getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 1,
    commitment: "confirmed",
  });
  if (!tx || tx.meta?.err) return null;
  return tx;
}

async function treasuryAta(): Promise<string | null> {
  if (!CONFIG.treasuryWallet || !CONFIG.ribbitMint) return null;
  const program = await detectTokenProgram(connection(), new PublicKey(CONFIG.ribbitMint));
  if (!program) return null;
  return getAssociatedTokenAddressSync(
    new PublicKey(CONFIG.ribbitMint),
    new PublicKey(CONFIG.treasuryWallet),
    true,
    program
  ).toBase58();
}

/**
 * Verify `signature` is a confirmed tx in which `wallet` transferred $OWP
 * to the house wallet's associated token account (a deposit).
 */
export async function verifyDepositTx(
  signature: string,
  wallet: string
): Promise<bigint | null> {
  const treasuryAtaAddress = await treasuryAta();
  if (!treasuryAtaAddress) return null;

  const tx = await getVerifiedTx(signature);
  if (!tx) return null;
  let total = 0n;
  for (const ix of parsedInstructions(tx)) {
    const { type, info } = ix.parsed as {
      type: string;
      info: Record<string, unknown>;
    };
    if (type !== "transfer" && type !== "transferChecked") continue;
    if (type === "transferChecked" && info.mint !== CONFIG.ribbitMint) continue;
    if (info.destination !== treasuryAtaAddress) continue;
    const authority = (info.authority ?? info.multisigAuthority) as string;
    if (authority !== wallet) continue;
    const amount =
      type === "transferChecked"
        ? (info.tokenAmount as { amount: string }).amount
        : (info.amount as string);
    total += BigInt(amount);
  }
  return total > 0n ? total : null;
}

export type SolPayment =
  | { status: "ok"; lamports: bigint; blockTime: number | null }
  | { status: "pending" }
  | { status: "failed" }
  | { status: "no-payment" }
  | { status: "too-small"; lamports: bigint }
  | { status: "too-large"; lamports: bigint };

/**
 * A confirmed System Program transfer of SOL from `wallet` to the house
 * wallet. The network fee is not part of the payment. `pending` means the
 * transaction is not visible yet — the caller must not consume the signature.
 * `failed` means it landed and failed: no SOL moved, and it never will.
 * `blockTime` is when the payment confirmed (unix seconds), when the RPC knows.
 */
export async function verifySolPayment(signature: string, wallet: string): Promise<SolPayment> {
  if (!CONFIG.treasuryWallet) return { status: "no-payment" };
  const tx = await connection().getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 1,
    commitment: "confirmed",
  });
  if (!tx) return { status: "pending" };
  if (tx.meta?.err) return { status: "failed" };
  const top = tx.transaction.message.instructions;
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions);
  let total = 0n;
  for (const ix of [...top, ...inner]) {
    if (!("parsed" in ix)) continue;
    if (!ix.programId.equals(SystemProgram.programId)) continue;
    const parsed = ix.parsed as { type: string; info: Record<string, unknown> };
    if (parsed.type !== "transfer") continue;
    const { source, destination, lamports } = parsed.info;
    if (source !== wallet || destination !== CONFIG.treasuryWallet) continue;
    if (typeof lamports !== "number" && typeof lamports !== "string") continue;
    total += BigInt(lamports);
  }
  if (total <= 0n) return { status: "no-payment" };
  if (total < MIN_BUY_LAMPORTS) return { status: "too-small", lamports: total };
  if (total > MAX_BUY_LAMPORTS) return { status: "too-large", lamports: total };
  return { status: "ok", lamports: total, blockTime: tx.blockTime ?? null };
}

export type TreasuryStats = {
  configured: boolean;
  solBalance: number | null;
  ribbitBalance: number | null;
  wallet: string | null;
};

// Treasury balances are read on several public pages — cache the RPC result
// briefly per instance so anonymous traffic can't amplify into RPC-quota
// burn. 30s staleness is immaterial for a dashboard (and the payout cap that
// reads this is best-effort by design).
const STATS_TTL_MS = 30_000;

// getTokenAccountsByOwner is an indexed lookup. Free and public RPCs refuse
// it ("Indexed requests require a personal token"), and every RPC rejects it
// while the mint account does not exist. After a refusal, skip it for a while
// and read the associated token account directly — a plain account read that
// every endpoint serves.
let indexedRefusedAt = 0;
const INDEXED_RETRY_MS = 10 * 60_000;

/**
 * Whole $OWP held by `owner`. Null when the mint is not on-chain yet or the
 * RPC could not answer; 0 when the wallet simply holds none.
 */
async function owpBalance(conn: Connection, owner: PublicKey): Promise<number | null> {
  if (!CONFIG.ribbitMint) return null;
  const mint = new PublicKey(CONFIG.ribbitMint);
  const program = await detectTokenProgram(conn, mint);
  if (!program) return null;

  if (Date.now() - indexedRefusedAt > INDEXED_RETRY_MS) {
    try {
      const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint });
      return accounts.value.reduce(
        (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
        0
      );
    } catch {
      indexedRefusedAt = Date.now();
    }
  }

  // The associated token account is where wallets hold a token and where the
  // payout worker sends from, so for the house it is the spendable float.
  const ata = getAssociatedTokenAddressSync(mint, owner, true, program);
  const info = await conn.getParsedAccountInfo(ata);
  if (!info.value) return 0;
  const data = info.value.data;
  if (!("parsed" in data)) return null;
  const ui = data.parsed?.info?.tokenAmount?.uiAmount;
  return typeof ui === "number" ? ui : null;
}

/**
 * SOL and $OWP for one address. The two reads fail independently: a token
 * lookup the RPC refuses must not blank a SOL balance it answered. Never throws.
 */
async function readBalances(
  address: string
): Promise<{ solBalance: number | null; ribbitBalance: number | null }> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(address);
  } catch {
    return { solBalance: null, ribbitBalance: null };
  }
  const conn = connection();
  const [solBalance, ribbitBalance] = await Promise.all([
    conn
      .getBalance(owner)
      .then((lamports) => lamports / LAMPORTS_PER_SOL)
      .catch(() => null),
    owpBalance(conn, owner).catch(() => null),
  ]);
  return { solBalance, ribbitBalance };
}

// SOL + $OWP for any PUBLIC address (the house wallet, a waitlist applicant),
// read-only and cached per instance. Only a public address is ever needed —
// the house wallet's private key stays on the worker box.
const walletCache = new Map<string, { at: number; value: TreasuryStats }>();

export async function getWalletBalances(address: string): Promise<TreasuryStats> {
  if (!address) return { configured: false, solBalance: null, ribbitBalance: null, wallet: null };
  const hit = walletCache.get(address);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value;
  const value: TreasuryStats = {
    configured: true,
    ...(await readBalances(address)),
    wallet: address,
  };
  // A read the RPC could not answer is not worth remembering: let the next
  // caller try again instead of serving 30 seconds of "unknown".
  if (value.solBalance !== null || value.ribbitBalance !== null) {
    walletCache.set(address, { at: Date.now(), value });
    // Applicants' addresses pass through here once each — keep the map small.
    if (walletCache.size > 500) {
      for (const [k, v] of walletCache) {
        if (Date.now() - v.at > STATS_TTL_MS) walletCache.delete(k);
      }
    }
  }
  return value;
}

/** Live treasury balances for the transparency dashboard. Never throws. */
export async function getTreasuryStats(): Promise<TreasuryStats> {
  return getWalletBalances(CONFIG.treasuryWallet);
}
