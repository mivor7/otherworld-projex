// On-chain verification helpers. The server never holds user keys — users
// sign burns/deposits in their own wallet, then submit the tx signature here
// for verification against the configured RPC.
import {
  Connection,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { CONFIG } from "./config";

// $RIBBIT is an SPL Token-2022 mint (owner program TokenzQdB…), NOT the
// classic Token program. Every ATA derivation and instruction MUST specify
// this program id or it targets the wrong account/program and fails.
const RIBBIT_TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID;

let _conn: Connection | null = null;
export function connection(): Connection {
  if (!_conn) _conn = new Connection(CONFIG.rpcUrl, "confirmed");
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
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || tx.meta?.err) return null;
  return tx;
}

/**
 * Verify `signature` is a confirmed tx in which `wallet` burned $RIBBIT.
 * Returns the total raw amount burned, or null if it doesn't check out.
 */
export async function verifyBurnTx(
  signature: string,
  wallet: string
): Promise<bigint | null> {
  const tx = await getVerifiedTx(signature);
  if (!tx) return null;
  let total = 0n;
  for (const ix of parsedInstructions(tx)) {
    const { type, info } = ix.parsed as {
      type: string;
      info: Record<string, unknown>;
    };
    if (type !== "burn" && type !== "burnChecked") continue;
    if (info.mint !== CONFIG.ribbitMint) continue;
    const authority = (info.authority ?? info.multisigAuthority) as string;
    if (authority !== wallet) continue;
    const amount =
      type === "burnChecked"
        ? (info.tokenAmount as { amount: string }).amount
        : (info.amount as string);
    total += BigInt(amount);
  }
  return total > 0n ? total : null;
}

/**
 * Verify `signature` is a confirmed tx in which `wallet` transferred $RIBBIT
 * to the treasury's associated token account (auction deposit).
 */
export async function verifyDepositTx(
  signature: string,
  wallet: string
): Promise<bigint | null> {
  if (!CONFIG.treasuryWallet) return null;
  const treasuryAta = getAssociatedTokenAddressSync(
    new PublicKey(CONFIG.ribbitMint),
    new PublicKey(CONFIG.treasuryWallet),
    true,
    RIBBIT_TOKEN_PROGRAM
  ).toBase58();

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
    if (info.destination !== treasuryAta) continue;
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

/**
 * Verify a "buy credits" tx: one tx, signed by `wallet`, that BOTH burns
 * $RIBBIT and transfers $RIBBIT to the treasury ATA. Returns the two raw
 * amounts, or null if it doesn't check out. Both legs must be present — a tx
 * that only burns (or only transfers) is not a valid buy.
 */
export async function verifyBuyTx(
  signature: string,
  wallet: string
): Promise<{ burnedRaw: bigint; houseRaw: bigint } | null> {
  if (!CONFIG.treasuryWallet) return null;
  const treasuryAta = getAssociatedTokenAddressSync(
    new PublicKey(CONFIG.ribbitMint),
    new PublicKey(CONFIG.treasuryWallet),
    true,
    RIBBIT_TOKEN_PROGRAM
  ).toBase58();

  const tx = await getVerifiedTx(signature);
  if (!tx) return null;

  let burnedRaw = 0n;
  let houseRaw = 0n;
  for (const ix of parsedInstructions(tx)) {
    const { type, info } = ix.parsed as {
      type: string;
      info: Record<string, unknown>;
    };
    const authority = (info.authority ?? info.multisigAuthority) as string;
    if (authority !== wallet) continue;

    if (type === "burn" || type === "burnChecked") {
      if (info.mint !== CONFIG.ribbitMint) continue;
      const amount =
        type === "burnChecked"
          ? (info.tokenAmount as { amount: string }).amount
          : (info.amount as string);
      burnedRaw += BigInt(amount);
    } else if (type === "transfer" || type === "transferChecked") {
      if (type === "transferChecked" && info.mint !== CONFIG.ribbitMint) continue;
      if (info.destination !== treasuryAta) continue;
      const amount =
        type === "transferChecked"
          ? (info.tokenAmount as { amount: string }).amount
          : (info.amount as string);
      houseRaw += BigInt(amount);
    }
  }

  // Both legs required, and each must be non-zero.
  if (burnedRaw <= 0n || houseRaw <= 0n) return null;
  return { burnedRaw, houseRaw };
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
let statsCache: { at: number; value: TreasuryStats } | null = null;
const STATS_TTL_MS = 30_000;

/** Live treasury balances for the transparency dashboard. Never throws. */
export async function getTreasuryStats(): Promise<TreasuryStats> {
  if (!CONFIG.treasuryWallet) {
    return { configured: false, solBalance: null, ribbitBalance: null, wallet: null };
  }
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) {
    return statsCache.value;
  }
  try {
    const owner = new PublicKey(CONFIG.treasuryWallet);
    const conn = connection();
    const [lamports, tokenAccounts] = await Promise.all([
      conn.getBalance(owner),
      conn.getParsedTokenAccountsByOwner(owner, {
        mint: new PublicKey(CONFIG.ribbitMint),
      }),
    ]);
    const ribbit = tokenAccounts.value.reduce(
      (sum, a) =>
        sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0
    );
    statsCache = {
      at: Date.now(),
      value: {
        configured: true,
        solBalance: lamports / LAMPORTS_PER_SOL,
        ribbitBalance: ribbit,
        wallet: CONFIG.treasuryWallet,
      },
    };
    return statsCache.value;
  } catch {
    return {
      configured: true,
      solBalance: null,
      ribbitBalance: null,
      wallet: CONFIG.treasuryWallet,
    };
  }
}

// SOL + $RIBBIT for any PUBLIC address (e.g. the payout hot wallet), read-only.
// Cached per-instance. Never throws. Only a public address is ever needed —
// the payout wallet's private key stays on the worker box.
const walletCache = new Map<string, { at: number; value: TreasuryStats }>();

export async function getWalletBalances(address: string): Promise<TreasuryStats> {
  if (!address) return { configured: false, solBalance: null, ribbitBalance: null, wallet: null };
  const hit = walletCache.get(address);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value;
  try {
    const owner = new PublicKey(address);
    const conn = connection();
    const [lamports, tokenAccounts] = await Promise.all([
      conn.getBalance(owner),
      conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(CONFIG.ribbitMint) }),
    ]);
    const ribbit = tokenAccounts.value.reduce(
      (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0
    );
    const value: TreasuryStats = {
      configured: true,
      solBalance: lamports / LAMPORTS_PER_SOL,
      ribbitBalance: ribbit,
      wallet: address,
    };
    walletCache.set(address, { at: Date.now(), value });
    return value;
  } catch {
    return { configured: true, solBalance: null, ribbitBalance: null, wallet: address };
  }
}
