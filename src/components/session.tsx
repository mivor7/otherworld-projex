"use client";

// App session: wallet-signature sign-in + balances, shared via context.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  refresh: () => Promise<void>;
  signIn: () => Promise<boolean>;
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

  const signIn = useCallback(async (): Promise<boolean> => {
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
        body: JSON.stringify({ wallet, signature: bs58.encode(signature) }),
      });
      if (!verifyRes.ok) {
        const d = await verifyRes.json().catch(() => null);
        setSignInError(
          verifyRes.status === 403
            ? (d?.error ?? "This wallet is suspended.")
            : "Sign-in failed — signature couldn't be verified. Try again."
        );
        return false;
      }
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

  return (
    <Ctx.Provider value={{ me, loading, signingIn, signInError, refresh, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
