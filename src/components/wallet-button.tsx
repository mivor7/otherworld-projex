"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "./session";
import { shortWallet } from "@/lib/client-config";

export function WalletButton() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { me, signIn, signOut, signingIn } = useSession();

  if (!publicKey) {
    return (
      <button className="btn btn-primary" onClick={() => setVisible(true)}>
        Connect wallet
      </button>
    );
  }

  if (!me.signedIn) {
    return (
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={signIn} disabled={signingIn}>
          {signingIn ? "Check your wallet…" : "Sign in"}
        </button>
        <button
          className="btn btn-ghost mono !text-xs"
          onClick={() => disconnect()}
          title={publicKey.toBase58()}
        >
          {shortWallet(publicKey.toBase58())}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs mono"
        style={{ borderColor: "var(--hairline-strong)", color: "var(--color-neon)" }}
        title="Play credits"
      >
        {me.credits ?? 0}
        <span className="kicker !text-[0.55rem]">cr</span>
      </span>
      <button
        className="btn btn-ghost mono !text-xs"
        onClick={async () => {
          await signOut();
          await disconnect();
        }}
        title={`Signed in as ${me.wallet} — click to sign out`}
      >
        {shortWallet(me.wallet ?? "")}
      </button>
    </div>
  );
}
