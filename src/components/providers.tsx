"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { rpcFetch } from "@/lib/rpc";
import { SessionProvider } from "./session";
import { NotificationsProvider } from "./use-notifications";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  // Wallet-standard wallets (Phantom, Solflare, Backpack…) register
  // themselves — no adapter list needed.
  const wallets = useMemo(() => [], []);
  const rpc = CLIENT_CONFIG.rpcUrl;
  const connectionConfig = useMemo(
    () => ({ commitment: "confirmed" as const, fetch: rpcFetch(rpc) }),
    [rpc]
  );
  return (
    <ConnectionProvider endpoint={rpc} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SessionProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
