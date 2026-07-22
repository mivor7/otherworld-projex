"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "./session";
import { CopyChip } from "./copy-chip";
import { useRibbitBalance } from "./use-ribbit-balance";
import { fmtRibbit, shortWallet } from "@/lib/client-config";

export function WalletButton() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { me, signIn, signOut, signingIn, signInError } = useSession();
  const ribbit = useRibbitBalance();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!publicKey) {
    return (
      <button className="btn btn-primary" onClick={() => setVisible(true)}>
        Connect wallet
      </button>
    );
  }

  if (!me.signedIn) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={signIn} disabled={signingIn}>
            {signingIn ? "Check your wallet…" : "Sign in"}
          </button>
          <button
            className="btn btn-ghost mono !text-xs"
            onClick={() => disconnect()}
            title={`${publicKey.toBase58()} — click to disconnect`}
          >
            {shortWallet(publicKey.toBase58())}
          </button>
        </div>
        <span className="text-[0.65rem] text-fog text-right leading-tight max-w-[15rem]">
          Signing in is free — a signature that proves you own this wallet, not a transaction.
        </span>
        {signInError && (
          <span className="text-[0.7rem] text-danger max-w-[16rem] text-right leading-tight">
            {signInError}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="btn btn-ghost !text-xs gap-2.5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="mono text-gold hidden sm:inline" title="$RIBBIT in your wallet">
          {ribbit === null
            ? "…"
            : ribbit.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
          $RIBBIT
        </span>
        <span className="mono text-neon" title="Play credits">{me.credits ?? 0} cr</span>
        <span className="mono hidden sm:inline">{shortWallet(me.wallet ?? "")}</span>
        <span
          className="text-fog transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="wallet-menu" role="menu">
          <div className="kicker !text-[0.6rem] mb-1">Signed in as</div>
          <div className="mono text-xs break-all mb-2" title={me.wallet}>
            {me.wallet}
          </div>
          <div className="mb-4">
            <CopyChip text={me.wallet ?? ""} label="Copy address" />
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-fog">$RIBBIT in wallet</span>
              <span className="stat-number text-gold">
                {ribbit === null
                  ? "…"
                  : ribbit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fog">Play credits</span>
              <span className="stat-number text-neon">{me.credits ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fog">Bidding balance</span>
              <span className="stat-number">{fmtRibbit(me.ribbitAvailable ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fog">Locked in bids</span>
              <span className="stat-number">{fmtRibbit(me.ribbitLocked ?? 0)}</span>
            </div>
          </div>

          <p className="text-[0.65rem] leading-snug mb-4" style={{ color: "var(--text-dim)" }}>
            Credits are your in-game chips. Bidding balance is $RIBBIT you&apos;ve
            deposited for auctions; locked is the part tied up in active bids.
          </p>

          <div className="grid gap-1.5 mb-4">
            <Link href="/games" className="btn btn-primary w-full !justify-start" onClick={() => setOpen(false)}>
              Buy credits
            </Link>
            <Link href="/account" className="btn btn-ghost w-full !justify-start" onClick={() => setOpen(false)}>
              My account
            </Link>
            <Link href="/fairness" className="btn btn-ghost w-full !justify-start" onClick={() => setOpen(false)}>
              Fairness &amp; seeds
            </Link>
          </div>

          <button
            className="btn btn-ghost w-full !text-danger"
            onClick={async () => {
              setOpen(false);
              await signOut();
              await disconnect();
            }}
          >
            Sign out &amp; disconnect
          </button>
        </div>
      )}
    </div>
  );
}
