"use client";

// The airdrop waitlist — public. Holders connect a wallet, the server verifies
// on-chain that they hold the required $RIBBIT, and they take the next
// position. Anyone who already joined (including the 260 who signed up by
// email on the old site) sees their own place here. No emails are ever shown.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "@/components/session";
import { PageHero } from "@/components/hero";
import { Notice } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";

type You =
  | {
      joined: true;
      position: number;
      joinedAt: string;
      referrals: number;
      referralWallet: string | null;
      viaEmail: boolean;
    }
  | { joined: false };

type Checked = { joined: boolean; position?: number; referrals?: number; joinedAt?: string };

type Data = {
  count: number;
  goal: number;
  open: boolean;
  minHoldRibbit: number;
  recent: { position: number; wallet: string; joinedAt: string }[];
  you: You | null;
  checked: Checked | null;
};

const n = (x: number) => Math.round(x).toLocaleString();

export default function WaitlistPage() {
  const { me } = useSession();
  // The waitlist is deliberately open to wallets WITHOUT an app account (the
  // invite gate guards accounts, never this list) — so the page talks to the
  // wallet adapter directly and proves ownership with a signed message.
  const { publicKey, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState<{ wallet: string; res: Checked } | null>(null);

  const adapterWallet = publicKey?.toBase58() ?? null;

  const load = useCallback(() => {
    // Signed-in users get `you` from the session; a connected-but-accountless
    // wallet is resolved through the public lookup instead.
    const q = !me.signedIn && adapterWallet ? `?wallet=${adapterWallet}` : "";
    fetch(`/api/waitlist${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [me.signedIn, adapterWallet]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    if (!me.signedIn && !adapterWallet) {
      setVisible(true); // open the wallet connect modal
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // A referral link (?ref=wallet) credits whoever sent you.
      const ref = new URLSearchParams(window.location.search).get("ref") ?? undefined;
      let proof: { wallet: string; signature: string } | null = null;
      if (!me.signedIn && adapterWallet) {
        // No app account needed: prove ownership by signing the nonce message.
        if (!signMessage) {
          setMsg({ kind: "err", text: "This wallet can't sign messages — try another wallet." });
          return;
        }
        const nonceRes = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: adapterWallet }),
        });
        if (!nonceRes.ok) {
          setMsg({ kind: "err", text: "Couldn't start — try again in a moment." });
          return;
        }
        const { message } = await nonceRes.json();
        const sig = await signMessage(new TextEncoder().encode(message));
        proof = { wallet: adapterWallet, signature: bs58.encode(sig) };
      }
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(ref ? { ref } : {}), ...(proof ?? {}) }),
      });
      const d = await res.json();
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: d.already
            ? "You're already on the list — your place is safe."
            : `You're in at position #${d.you.position}. Your place is locked.`,
        });
        load();
      } else {
        setMsg({ kind: "err", text: d.error ?? "Couldn't join right now." });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setMsg({
        kind: "err",
        text: /reject|denied|cancel/i.test(m)
          ? "Signing cancelled in your wallet."
          : "Connection hiccup — try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const checkWallet = async () => {
    const w = lookup.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) {
      setLookupResult({ wallet: w, res: { joined: false } });
      return;
    }
    const d = await fetch(`/api/waitlist?wallet=${w}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (d?.checked) setLookupResult({ wallet: w, res: d.checked });
  };

  // Session users come back in `you`; accountless-but-connected wallets come
  // back in `checked` (requested via ?wallet= above).
  const you: You | null = me.signedIn
    ? (data?.you ?? null)
    : adapterWallet && data?.checked
      ? data.checked.joined
        ? {
            joined: true,
            position: data.checked.position!,
            joinedAt: data.checked.joinedAt!,
            referrals: data.checked.referrals ?? 0,
            referralWallet: adapterWallet,
            viaEmail: false,
          }
        : { joined: false }
      : null;
  const joined = !!you && you.joined;
  const pct = data ? Math.min(100, Math.round((data.count / data.goal) * 100)) : 0;
  const refLink =
    joined && you.referralWallet
      ? `${typeof window === "undefined" ? "" : window.location.origin}/waitlist?ref=${you.referralWallet}`
      : null;

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/art-bounty.jpg"
        imagePosition="center 40%"
        kicker="The airdrop"
        badge={data ? (data.open ? "Sign-ups open" : "Sign-ups closed") : "The airdrop"}
        title="Airdrop"
        titleAccent="waitlist"
        subtitle="Hold $RIBBIT, take your place. The airdrop is guaranteed once the list is full — every member's position and referrals are locked in from the moment they join."
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-8">
        <div className="space-y-4">
          {/* Progress toward the guarantee */}
          <div className="panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-3">
              <span className="stat-number text-neon text-2xl">
                {data ? `${n(data.count)} / ${n(data.goal)}` : "…"}
              </span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                {data && data.count < data.goal
                  ? `${n(data.goal - data.count)} places until the airdrop is guaranteed`
                  : data
                    ? "The list is full — the airdrop is guaranteed."
                    : ""}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.01 165)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
                }}
              />
            </div>
          </div>

          {/* Your place / join */}
          <div className="panel panel-glow p-6">
            {!data ? (
              <p className="text-fog text-sm">Reading the list…</p>
            ) : joined ? (
              <>
                <div className="kicker !text-[0.65rem] mb-1.5">Your place</div>
                <div className="stat-number text-neon text-3xl leading-none mb-2">
                  #{n(you.position)}
                </div>
                <p className="text-sm text-fog">
                  Locked in since{" "}
                  {new Date(you.joinedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {you.referrals > 0 && (
                    <>
                      {" "}· <span className="text-frost">{n(you.referrals)}</span> referral
                      {you.referrals === 1 ? "" : "s"}
                    </>
                  )}
                  {you.viaEmail && <> · joined by email on the original signup</>}
                </p>
                {refLink && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--hairline)" }}>
                    <div className="kicker !text-[0.6rem] mb-1.5">Your referral link</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        className="mono text-xs px-2 py-1.5 rounded break-all"
                        style={{ background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--hairline)" }}
                      >
                        {refLink}
                      </code>
                      <button
                        className="btn btn-ghost !text-xs"
                        onClick={() => {
                          navigator.clipboard?.writeText(refLink).then(
                            () => {
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            },
                            () => {}
                          );
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
                      Anyone who joins through your link counts as your referral.
                    </p>
                  </div>
                )}
              </>
            ) : !me.signedIn && !adapterWallet ? (
              <>
                <div className="kicker !text-[0.65rem] mb-2">Join the waitlist</div>
                <p className="text-sm text-fog mb-4">
                  {`You need ${n(data.minHoldRibbit)} $RIBBIT held in your wallet — verified on-chain, nothing is transferred and nothing is locked. No invite or account needed: connecting and signing one message is enough.`}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary btn-lg px-8" onClick={join} disabled={!data.open}>
                    {data.open ? "Connect wallet to join" : "Sign-ups closed"}
                  </button>
                  <a href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Get $RIBBIT on pump.fun ↗
                  </a>
                  {CLIENT_CONFIG.meteoraUrl && (
                    <a href={CLIENT_CONFIG.meteoraUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Meteora pool ↗
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="kicker !text-[0.65rem] mb-2">Join the waitlist</div>
                <p className="text-sm text-fog mb-4">
                  {`Your wallet needs ${n(data.minHoldRibbit)} $RIBBIT held on-chain. We check the chain when you press the button — your tokens stay exactly where they are.${!me.signedIn ? " You'll sign one message to prove the wallet is yours — no account, no invite needed." : ""}`}
                </p>
                <button
                  className="btn btn-primary btn-lg px-8"
                  onClick={join}
                  disabled={busy || !data.open}
                >
                  {busy
                    ? "Checking the chain…"
                    : !data.open
                      ? "Sign-ups closed"
                      : me.signedIn
                        ? "Take my place"
                        : "Sign to take my place"}
                </button>
                {!data.open && (
                  <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
                    The list is frozen right now. Existing places are unaffected.
                  </p>
                )}
              </>
            )}
            {msg && (
              <div className="mt-4">
                <Notice kind={msg.kind === "ok" ? "info" : "err"}>{msg.text}</Notice>
              </div>
            )}
          </div>

          {/* The terms, plainly */}
          <div className="panel p-6">
            <div className="kicker mb-4">How it works</div>
            <ul className="text-sm text-fog space-y-3 leading-relaxed">
              <li>
                <span className="text-frost font-medium">Hold to qualify.</span>{" "}
                {`${data ? n(data.minHoldRibbit) : "250,000"} $RIBBIT in your wallet, checked on-chain at the moment you join. Nothing is sent, staked or locked — the waitlist never touches your tokens.`}
              </li>
              <li>
                <span className="text-frost font-medium">Your place is yours.</span> Position
                and referral count are recorded when you join and never recalculated. Members
                who signed up by email on the original site keep the exact positions they
                earned.
              </li>
              <li>
                <span className="text-frost font-medium">
                  {`Guaranteed at ${data ? n(data.goal) : "1,000"}.`}
                </span>{" "}
                {`Once the list reaches ${data ? n(data.goal) : "1,000"} members the airdrop is guaranteed. The amount is announced by the team — it isn't set here.`}
              </li>
              <li>
                <span className="text-frost font-medium">One place per wallet.</span> Referrals
                are credited to the member whose link brought you in.
              </li>
            </ul>
          </div>
        </div>

        <aside className="panel p-5 h-fit lg:sticky lg:top-24">
          <div className="kicker mb-1.5">Latest to join</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Wallets only — no names, no emails, ever.
          </p>
          {!data ? (
            <p className="text-fog text-sm">Loading…</p>
          ) : data.recent.length === 0 ? (
            <p className="text-fog text-sm">No wallet sign-ups yet — be the first.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.position} className="table-row">
                    <td className="py-1.5 pr-2 mono text-xs" style={{ color: "var(--text-dim)" }}>
                      #{r.position}
                    </td>
                    <td className="py-1.5 pr-2 mono text-xs">{r.wallet}</td>
                    <td className="py-1.5 text-right text-xs" style={{ color: "var(--text-dim)" }}>
                      {new Date(r.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--hairline)" }}>
            <div className="kicker !text-[0.6rem] mb-2">Check a wallet</div>
            <div className="flex gap-2">
              <input
                className="input !text-xs flex-1 min-w-0"
                placeholder="Wallet address"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkWallet()}
              />
              <button className="btn btn-ghost !text-xs" onClick={checkWallet}>
                Check
              </button>
            </div>
            {lookupResult && (
              <p className="text-xs mt-2 text-fog">
                {lookupResult.res.joined
                  ? `${lookupResult.wallet.slice(0, 4)}…${lookupResult.wallet.slice(-4)} is on the list — position #${lookupResult.res.position}.`
                  : `${lookupResult.wallet.slice(0, 4)}…${lookupResult.wallet.slice(-4)} hasn't joined yet.`}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--hairline)" }}>
            <Link href="/about" className="text-xs text-neon hover:underline">
              About $RIBBIT →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
