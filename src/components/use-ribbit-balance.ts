"use client";

// The connected wallet's live $RIBBIT balance (Token-2022), for the top panel.
// Refreshes on mount, on a slow poll, and whenever a buy/burn dispatches
// "owp:balance" so it reflects a purchase immediately. Returns null until the
// first read (or when no wallet is connected).
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { CLIENT_CONFIG } from "@/lib/client-config";

export function useRibbitBalance(): number | null {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    try {
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(CLIENT_CONFIG.ribbitMint),
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const b = await connection.getTokenAccountBalance(ata);
      setBalance(b.value.uiAmount ?? 0);
    } catch {
      setBalance(0); // no token account yet = 0 held
    }
  }, [connection, publicKey]);

  useEffect(() => {
    // Async read-then-set — the setState lands after the await, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 20_000);
    const onChange = () => load();
    window.addEventListener("owp:balance", onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener("owp:balance", onChange);
    };
  }, [load]);

  return balance;
}
