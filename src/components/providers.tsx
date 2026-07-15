"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { SessionProvider } from "./session";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  // Wallet-standard wallets (Phantom, Solflare, Backpack…) register
  // themselves — no adapter list needed.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={CLIENT_CONFIG.rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SessionProvider>{children}</SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
