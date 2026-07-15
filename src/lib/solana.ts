// On-chain verification helpers. The server never holds user keys — users
// sign burns/deposits in their own wallet, then submit the tx signature here
// for verification against the configured RPC.
import {
  Connection,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CONFIG } from "./config";

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
    true
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

export type TreasuryStats = {
  configured: boolean;
  solBalance: number | null;
  ribbitBalance: number | null;
  wallet: string | null;
};

/** Live treasury balances for the transparency dashboard. Never throws. */
export async function getTreasuryStats(): Promise<TreasuryStats> {
  if (!CONFIG.treasuryWallet) {
    return { configured: false, solBalance: null, ribbitBalance: null, wallet: null };
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
    return {
      configured: true,
      solBalance: lamports / LAMPORTS_PER_SOL,
      ribbitBalance: ribbit,
      wallet: CONFIG.treasuryWallet,
    };
  } catch {
    return {
      configured: true,
      solBalance: null,
      ribbitBalance: null,
      wallet: CONFIG.treasuryWallet,
    };
  }
}
