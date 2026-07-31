"use client";

// App session: wallet-signature sign-in + balances, shared via context.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

export type Me = {
  signedIn: boolean;
  wallet?: string;
  isAdmin?: boolean;
  credits?: number;
  ribbitBalance?: string;
  ribbitLocked?: string;
  ribbitAvailable?: string;
  seedHash?: string;
  nonce?: number;
};

type SessionCtx = {
  me: Me;
  loading: boolean;
  signingIn: boolean;
  signInError: string | null;
  /** Server asked for an invite code (invite-only launch) — show the input. */
  needsInvite: boolean;
  refresh: () => Promise<void>;
  /** Apply a server-reported chip balance instantly (game responses carry
   *  it) — no refetch round-trip, so counters never lag fast play. */
  setCredits: (credits: number) => void;
  signIn: (inviteCode?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const [me, setMe] = useState<Me>({ signedIn: false });
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [needsInvite, setNeedsInvite] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      setMe(await res.json());
    } catch {
      setMe({ signedIn: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Async fetch-then-set — state updates land after the await, no cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (inviteCode?: string): Promise<boolean> => {
    setSignInError(null);
    if (!publicKey || !signMessage) {
      setSignInError("Connect a wallet that can sign messages first.");
      return false;
    }
    setSigningIn(true);
    try {
      const wallet = publicKey.toBase58();
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (!nonceRes.ok) {
        setSignInError("Couldn't start sign-in — try again in a moment.");
        return false;
      }
      const { message } = await nonceRes.json();
      const signature = await signMessage(new TextEncoder().encode(message));
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          signature: bs58.encode(signature),
          ...(inviteCode?.trim() ? { inviteCode: inviteCode.trim() } : {}),
        }),
      });
      if (!verifyRes.ok) {
        const d = await verifyRes.json().catch(() => null);
        const msg: string = d?.error ?? "";
        // Invite-only launch: a new wallet needs a code — flip the UI into
        // invite mode instead of treating it as a failure.
        if (verifyRes.status === 403 && /invite/i.test(msg)) {
          setNeedsInvite(true);
          setSignInError(msg);
          return false;
        }
        setSignInError(
          verifyRes.status === 403
            ? (msg || "This wallet is suspended.")
            : "Sign-in failed — signature couldn't be verified. Try again."
        );
        return false;
      }
      setNeedsInvite(false);
      await refresh();
      return true;
    } catch (e) {
      // Most common: the user rejected the signature in their wallet.
      const msg = e instanceof Error ? e.message : "";
      setSignInError(
        /reject|denied|cancel/i.test(msg)
          ? "Sign-in cancelled in your wallet."
          : "Sign-in didn't complete — please try again."
      );
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage, refresh]);

  const setCredits = useCallback((credits: number) => {
    setMe((m) => (m.signedIn ? { ...m, credits } : m));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe({ signedIn: false });
  }, []);

  // If the connected wallet changes and no longer matches the session, drop it.
  useEffect(() => {
    if (me.signedIn && publicKey && me.wallet !== publicKey.toBase58()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      signOut();
    }
  }, [publicKey, me.signedIn, me.wallet, signOut]);

  // Memoize the context value — a fresh object every render would re-render
  // every useSession consumer app-wide whenever the provider re-renders.
  const value = useMemo(
    () => ({ me, loading, signingIn, signInError, needsInvite, refresh, setCredits, signIn, signOut }),
    [me, loading, signingIn, signInError, needsInvite, refresh, setCredits, signIn, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
