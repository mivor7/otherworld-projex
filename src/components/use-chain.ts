"use client";

// Client-side on-chain actions. All transactions are built locally and signed
// by the user's wallet — the app never sees a private key. After confirmation
// the tx signature is submitted to the API for server-side verification.
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { CLIENT_CONFIG, toRawClient } from "@/lib/client-config";

// $RIBBIT is an SPL Token-2022 mint. Every ATA derivation and token
// instruction MUST pass this program id — the spl-token defaults target the
// classic Token program, which derives the wrong ATA and builds instructions
// the mint's program can't execute (the transaction just fails).
const TP = TOKEN_2022_PROGRAM_ID;

export type ChainResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

async function postJson(url: string, body: unknown): Promise<ChainResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error ?? "Request failed" };
  return { ok: true, data };
}

// ——— payment-can-never-be-lost machinery ———
// The moment the wallet SENDS a transaction, the payment exists on-chain.
// From then on a flaky browser RPC (confirmation timeout, 403) must never
// cost the player their redemption: the signature is stored BEFORE we wait
// for confirmation, redemption is retried against the server (which verifies
// on-chain with its own RPC), and anything still unredeemed stays stored so
// it can be replayed on the next visit or pasted in by hand.
const PENDING_KEY = "owp-pending-redemptions";
type PendingRedemption = { url: string; signature: string; at: number };

function pendingList(): PendingRedemption[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function savePending(list: PendingRedemption[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-20)));
  } catch {}
}
function addPending(url: string, signature: string) {
  savePending([...pendingList().filter((p) => p.signature !== signature), { url, signature, at: Date.now() }]);
}
function removePending(signature: string) {
  savePending(pendingList().filter((p) => p.signature !== signature));
}

/** "Already redeemed" (409) means the credits landed earlier — success. */
const isAlreadyRedeemed = (e: string) => /already/i.test(e);
/** Not-found-yet on chain — worth retrying, the tx may still be propagating. */
const isNotYetVisible = (e: string) => /could not verify/i.test(e);
/** Server throttle — stop hammering; the saved signature retries later. */
const isRateLimited = (e: string) => /too many/i.test(e);

const SAVED_MSG =
  "Your payment is safe — the signature is saved and will be redeemed " +
  "automatically next time you open this page, or paste it below.";

async function redeemWithRetry(url: string, signature: string): Promise<ChainResult> {
  let last: ChainResult = { ok: false, error: "Redemption failed" };
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
    try {
      last = await postJson(url, { signature });
    } catch {
      last = { ok: false, error: "Network error while redeeming — will retry" };
      continue;
    }
    if (last.ok) {
      removePending(signature);
      return last;
    }
    if (isAlreadyRedeemed(last.error)) {
      removePending(signature);
      return { ok: true, data: { alreadyRedeemed: true } };
    }
    // Rate-limited: do NOT keep retrying (that's what caused the lockout).
    // Leave it saved and let the next page load / manual retry handle it.
    if (isRateLimited(last.error)) {
      return { ok: false, error: `The house is busy verifying. ${SAVED_MSG}` };
    }
    if (!isNotYetVisible(last.error)) return last; // terminal (e.g. wrong wallet)
  }
  return { ok: false, error: `${last.ok ? "" : last.error}. ${SAVED_MSG}` };
}

/**
 * Send → persist signature → best-effort confirm → redeem with retries.
 * The confirmation step is cosmetic (the server re-verifies on-chain);
 * its failure must never abort the redemption.
 */
async function sendAndRedeem(
  sendTx: () => Promise<string>,
  confirm: (sig: string) => Promise<unknown>,
  url: string
): Promise<ChainResult> {
  const signature = await sendTx();
  addPending(url, signature);
  try {
    await confirm(signature);
  } catch {
    // Timeout / RPC hiccup — the tx may well have landed. Redeem anyway.
  }
  return redeemWithRetry(url, signature);
}

/** Replay any stored, unredeemed payment signatures (call on page load). */
export async function redeemPendingPayments(): Promise<ChainResult[]> {
  const results: ChainResult[] = [];
  for (const p of pendingList()) {
    if (Date.now() - p.at > 7 * 24 * 3600 * 1000) {
      removePending(p.signature); // stale beyond any retry usefulness
      continue;
    }
    results.push(await redeemWithRetry(p.url, p.signature));
  }
  return results;
}

/** Manual recovery: redeem a pasted transaction signature. */
export async function redeemSignature(url: string, signature: string): Promise<ChainResult> {
  return redeemWithRetry(url, signature.trim());
}

// Pre-flight check so users get a clear reason BEFORE we build a doomed tx —
// instead of a cryptic wallet/RPC error after signing. Returns an error
// message string, or null if funds are sufficient.
async function insufficientFundsReason(
  connection: Connection,
  owner: PublicKey,
  neededRibbitRaw: bigint
): Promise<string | null> {
  const mint = new PublicKey(CLIENT_CONFIG.ribbitMint);
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TP);
  let balance = 0n;
  try {
    const b = await connection.getTokenAccountBalance(ata);
    balance = BigInt(b.value.amount);
  } catch {
    balance = 0n; // no token account → no $RIBBIT held
  }
  const fmt = (raw: bigint) =>
    (Number(raw) / 10 ** CLIENT_CONFIG.ribbitDecimals).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  if (balance < neededRibbitRaw) {
    return `Not enough $RIBBIT — you have ${fmt(balance)}, this needs ${fmt(neededRibbitRaw)}.`;
  }
  // A tiny bit of SOL is needed for the network fee (and to open a token
  // account on first receipt). ~0.003 SOL covers it.
  try {
    const sol = await connection.getBalance(owner);
    if (sol < 3_000_000) {
      return "Not enough SOL for the network fee — add a little SOL (about 0.01) and retry.";
    }
  } catch {
    // If the balance read fails, don't block — the wallet will surface it.
  }
  return null;
}

export function useChain() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  /** Burn $RIBBIT from the user's wallet, then redeem play credits. */
  const burnForCredits = useCallback(
    async (ribbitAmount: number): Promise<ChainResult> => {
      if (!publicKey) return { ok: false, error: "Connect your wallet first" };
      try {
        const mint = new PublicKey(CLIENT_CONFIG.ribbitMint);
        const ata = getAssociatedTokenAddressSync(mint, publicKey, false, TP);
        const shortfall = await insufficientFundsReason(
          connection,
          publicKey,
          toRawClient(ribbitAmount)
        );
        if (shortfall) return { ok: false, error: shortfall };
        const tx = new Transaction().add(
          createBurnCheckedInstruction(
            ata,
            mint,
            publicKey,
            toRawClient(ribbitAmount),
            CLIENT_CONFIG.ribbitDecimals,
            [],
            TP
          )
        );
        return await sendAndRedeem(
          () => sendTransaction(tx, connection),
          (sig) => connection.confirmTransaction(sig, "confirmed"),
          "/api/burn/verify"
        );
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Burn failed" };
      }
    },
    [publicKey, sendTransaction, connection]
  );

  /**
   * Buy credits: one signed tx that burns part of the $RIBBIT and transfers
   * the rest to the treasury (real house revenue). Both legs are verified
   * server-side. The burn/house split is a LIVE house setting, so it's
   * fetched just-in-time — building against a stale build-time ratio could
   * strand the payment at verification.
   */
  const buyCredits = useCallback(
    async (ribbitAmount: number): Promise<ChainResult> => {
      if (!publicKey) return { ok: false, error: "Connect your wallet first" };
      if (!CLIENT_CONFIG.treasuryWallet)
        return { ok: false, error: "Buying credits isn't available yet" };
      try {
        let buyBurnShare = CLIENT_CONFIG.buyBurnShare;
        try {
          const live = await (await fetch("/api/config")).json();
          if (live.creditSalesPaused)
            return { ok: false, error: "Credit sales are paused — back shortly" };
          if (typeof live.buyBurnShare === "number") buyBurnShare = live.buyBurnShare;
        } catch {
          // fall back to the build-time split; the server re-verifies anyway
        }
        const mint = new PublicKey(CLIENT_CONFIG.ribbitMint);
        const treasury = new PublicKey(CLIENT_CONFIG.treasuryWallet);
        const ata = getAssociatedTokenAddressSync(mint, publicKey, false, TP);
        const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, true, TP);
        // Split the payment; the burned side takes the rounding remainder so
        // burn + house exactly equals what the player intends to pay.
        const total = toRawClient(ribbitAmount);
        const houseRaw =
          (total * BigInt(Math.round((1 - buyBurnShare) * 1000))) / 1000n;
        const burnRaw = total - houseRaw;
        if (burnRaw <= 0n || houseRaw <= 0n)
          return { ok: false, error: "Amount too small to split" };
        const shortfall = await insufficientFundsReason(connection, publicKey, total);
        if (shortfall) return { ok: false, error: shortfall };
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            treasuryAta,
            treasury,
            mint,
            TP
          ),
          createBurnCheckedInstruction(
            ata,
            mint,
            publicKey,
            burnRaw,
            CLIENT_CONFIG.ribbitDecimals,
            [],
            TP
          ),
          createTransferCheckedInstruction(
            ata,
            mint,
            treasuryAta,
            publicKey,
            houseRaw,
            CLIENT_CONFIG.ribbitDecimals,
            [],
            TP
          )
        );
        return await sendAndRedeem(
          () => sendTransaction(tx, connection),
          (sig) => connection.confirmTransaction(sig, "confirmed"),
          "/api/credits/buy"
        );
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Purchase failed" };
      }
    },
    [publicKey, sendTransaction, connection]
  );

  /** Transfer $RIBBIT to the treasury to fund the auction bidding balance. */
  const depositForBidding = useCallback(
    async (ribbitAmount: number): Promise<ChainResult> => {
      if (!publicKey) return { ok: false, error: "Connect your wallet first" };
      if (!CLIENT_CONFIG.treasuryWallet)
        return { ok: false, error: "Treasury not configured yet" };
      try {
        const mint = new PublicKey(CLIENT_CONFIG.ribbitMint);
        const treasury = new PublicKey(CLIENT_CONFIG.treasuryWallet);
        const from = getAssociatedTokenAddressSync(mint, publicKey, false, TP);
        const to = getAssociatedTokenAddressSync(mint, treasury, true, TP);
        const shortfall = await insufficientFundsReason(
          connection,
          publicKey,
          toRawClient(ribbitAmount)
        );
        if (shortfall) return { ok: false, error: shortfall };
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            to,
            treasury,
            mint,
            TP
          ),
          createTransferCheckedInstruction(
            from,
            mint,
            to,
            publicKey,
            toRawClient(ribbitAmount),
            CLIENT_CONFIG.ribbitDecimals,
            [],
            TP
          )
        );
        return await sendAndRedeem(
          () => sendTransaction(tx, connection),
          (sig) => connection.confirmTransaction(sig, "confirmed"),
          "/api/deposits/verify"
        );
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Deposit failed" };
      }
    },
    [publicKey, sendTransaction, connection]
  );

  return { burnForCredits, buyCredits, depositForBidding };
}
