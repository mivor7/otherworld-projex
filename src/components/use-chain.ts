"use client";

// Client-side on-chain actions. All transactions are built locally and signed
// by the user's wallet — the app never sees a private key. After confirmation
// the tx signature is submitted to the API for server-side verification.
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { CLIENT_CONFIG, toRawClient } from "@/lib/client-config";

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

export function useChain() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  /** Burn $RIBBIT from the user's wallet, then redeem play credits. */
  const burnForCredits = useCallback(
    async (ribbitAmount: number): Promise<ChainResult> => {
      if (!publicKey) return { ok: false, error: "Connect your wallet first" };
      try {
        const mint = new PublicKey(CLIENT_CONFIG.ribbitMint);
        const ata = getAssociatedTokenAddressSync(mint, publicKey);
        const tx = new Transaction().add(
          createBurnCheckedInstruction(
            ata,
            mint,
            publicKey,
            toRawClient(ribbitAmount),
            CLIENT_CONFIG.ribbitDecimals
          )
        );
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");
        return postJson("/api/burn/verify", { signature });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Burn failed" };
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
        const from = getAssociatedTokenAddressSync(mint, publicKey);
        const to = getAssociatedTokenAddressSync(mint, treasury, true);
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            to,
            treasury,
            mint
          ),
          createTransferCheckedInstruction(
            from,
            mint,
            to,
            publicKey,
            toRawClient(ribbitAmount),
            CLIENT_CONFIG.ribbitDecimals
          )
        );
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");
        return postJson("/api/deposits/verify", { signature });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Deposit failed" };
      }
    },
    [publicKey, sendTransaction, connection]
  );

  return { burnForCredits, depositForBidding };
}
