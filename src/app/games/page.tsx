"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain, redeemPendingPayments, redeemSignature } from "@/components/use-chain";
import { useHouseConfig } from "@/components/use-house-config";
import { PageHero } from "@/components/hero";
import { MatteMedia } from "@/components/matte-media";
import { Notice } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";

// Casino tables — wager whole $OWP from the in-app balance.
const CREDIT_GAMES = [
  {
    href: "/games/flip",
    image: "/art/owp_pump.png",
    name: "Frog Flip",
    desc: "", // computed live from the house edge at render
    badge: "Even odds",
  },
  {
    href: "/games/dice",
    image: "/art/art-dice.jpg",
    name: "Pond Dice",
    desc: "", // computed live from the house edge at render
    badge: "Choose your risk",
  },
  {
    href: "/games/blackjack",
    image: "/art/owp_bj.png",
    name: "Blackjack",
    desc: "Single deck, dealer stands on 17, naturals pay 3:2. Every deck order is committed before the deal.",
    badge: "3:2 tables",
  },
];
// Free arcade — skill games, no wager. A live bounty (if any) shows as a
// gold overlay; prize boards still require a deposited $OWP balance.
const FREE_GAMES = [
  {
    href: "/games/hopper",
    image: "/art/owp_frogger.png",
    name: "Hopper",
    desc: "Cross the traffic, climb the weekly leaderboard.",
    badge: "Free",
  },
  {
    href: "/games/frogris",
    image: "/art/owp_frogris.png",
    name: "Frogris",
    desc: "The falling-block episode. Clear lines, chase levels, top the weekly board.",
    badge: "Free",
  },
  {
    href: "/games/worm",
    image: "/art/owp_worm.png",
    name: "Worm Frog",
    desc: "Slither, grow, and don't bite your own tail. Ten points a fly.",
    badge: "Free",
  },
];

type HistoryRow = {
  id: string;
  game: string;
  wager: number;
  payout: number;
  outcome: Record<string, unknown>;
  clientSeed: string;
  nonce: number;
  serverSeed: string | null;
  createdAt: string;
};

export default function GamesPage() {
  const { me, refresh } = useSession();
  const { depositForBidding } = useChain();
  const mintLive = !!CLIENT_CONFIG.ribbitMint;
  const house = useHouseConfig();
  const [depositAmount, setDepositAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [rescueSig, setRescueSig] = useState("");
  const [liveBounties, setLiveBounties] = useState<
    Record<string, { prizeRibbit: number; prizeText: string | null }>
  >({});

  useEffect(() => {
    if (!me.signedIn) return;
    fetch("/api/games/history")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setHistory(rows))
      .catch(() => {});
    // A payment whose browser-side confirmation timed out is stored locally —
    // replay it now that we're back: the server verifies on-chain itself.
    redeemPendingPayments()
      .then(async (results) => {
        const won = results.filter((r) => r.ok);
        if (won.length > 0) {
          setMsg({ kind: "ok", text: "Recovered a pending deposit — balance updated." });
          await refresh();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.signedIn]);

  const doRescue = async () => {
    if (rescueSig.trim().length < 64) return;
    setBusy(true);
    setMsg(null);
    const res = await redeemSignature("/api/deposits/verify", rescueSig);
    setMsg(
      res.ok
        ? { kind: "ok", text: "Deposit verified on-chain — balance updated." }
        : { kind: "err", text: res.error }
    );
    if (res.ok) {
      setRescueSig("");
      await refresh();
    }
    setBusy(false);
  };

  useEffect(() => {
    fetch("/api/bounties/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.games && setLiveBounties(d.games))
      .catch(() => {});
  }, []);

  const depositValid = Number.isInteger(depositAmount) && depositAmount >= 1;

  const doDeposit = async () => {
    if (!depositValid) return;
    setBusy(true);
    setMsg(null);
    const res = await depositForBidding(depositAmount);
    if (res.ok) {
      setMsg({
        kind: "ok",
        text: `Deposited ${depositAmount.toLocaleString()} $OWP. It's in your app balance.`,
      });
      await refresh();
      window.dispatchEvent(new Event("owp:balance"));
    } else {
      setMsg({ kind: "err", text: res.error });
    }
    setBusy(false);
  };

  const doFaucet = async () => {
    setBusy(true);
    const res = await fetch("/api/dev/faucet", { method: "POST" });
    setMsg(
      res.ok
        ? { kind: "ok", text: "100 demo $OWP added to your balance (dev faucet)." }
        : { kind: "err", text: "Faucet unavailable" }
    );
    await refresh();
    setBusy(false);
  };

  const renderCard = (g: {
    href: string;
    image: string;
    name: string;
    desc: string;
    badge: string;
  }) => {
    const gameKey = g.href.split("/").pop()!;
    const live = liveBounties[gameKey];
    return (
      <Link key={g.href} href={g.href} className="lot-card group">
        <div className="card-media">
          <MatteMedia src={g.image} fit="cover" />
          <span className="badge absolute top-2 right-2">{g.badge}</span>
          {live && (
            <span className="badge badge-gold absolute top-2 left-2">
              <span className="live-dot" /> bounty ·{" "}
              {live.prizeText ??
                `${live.prizeRibbit.toLocaleString(undefined, { maximumFractionDigits: 0 })} $OWP`}
            </span>
          )}
        </div>
        <div className="card-body">
          <h3 className="!text-[1rem] group-hover:text-neon transition-colors">{g.name}</h3>
          <p className="text-fog text-[0.85rem] leading-relaxed">
            {g.href === "/games/flip"
              ? `Frog or fly — call the flip. ${(2 * (1 - house.houseEdge)).toFixed(2)}× on a win.`
              : g.href === "/games/dice"
                ? `Set your own line, roll under it. Up to ${Math.floor(50 * (1 - house.houseEdge))}× payouts.`
                : g.desc}
          </p>
          <div className="card-price-row">
            <span className="card-price-label">{live ? "Live bounty" : "Play"}</span>
            <span className="text-fog group-hover:text-neon transition-colors">→</span>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/owp_hero.jpg"
        imagePosition="center 42%"
        kicker="Wing I — the arcade"
        badge="Tables open"
        title="Step into the"
        titleAccent="arcade"
        subtitle="Deposit $OWP and wager it at the tables. Provably fair, published edge. Withdraw anytime — the house pays automatically. The arcade episodes are free and pay weekly bounties."
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-8">
        <div className="grid sm:grid-cols-2 gap-4 content-start order-2 lg:order-1">
          <div className="sm:col-span-2">
            <div className="kicker">Casino tables</div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
              Wagered in $OWP · provably fair, published edge
            </p>
          </div>
          {CREDIT_GAMES.map(renderCard)}

          <div className="sm:col-span-2 pt-2">
            <div className="kicker">Free arcade</div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
              Skill games · free to play; a live bounty pays weekly to eligible depositors
            </p>
          </div>
          {FREE_GAMES.map(renderCard)}

          {me.signedIn && history.length > 0 && (
            <div className="panel p-5 sm:col-span-2">
              <div className="kicker mb-3">Your recent rounds</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {history.slice(0, 8).map((h) => (
                      <tr key={h.id} className="table-row">
                        <td className="py-2 pr-3 capitalize">{h.game}</td>
                        <td className="py-2 pr-3 text-fog mono text-xs">−{h.wager}</td>
                        <td
                          className={`py-2 pr-3 mono text-xs ${h.payout > 0 ? "text-neon" : ""}`}
                          style={h.payout === 0 ? { color: "var(--text-dim)" } : undefined}
                        >
                          {h.payout > 0 ? `+${h.payout}` : "0"}
                        </td>
                        <td className="py-2 text-xs text-right" style={{ color: "var(--text-dim)" }}>
                          {new Date(h.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <Link
                            href={`/fairness?client=${encodeURIComponent(h.clientSeed)}&nonce=${h.nonce}${h.serverSeed ? `&seed=${h.serverSeed}` : ""}`}
                            className="text-xs text-neon hover:underline"
                            title={h.serverSeed ? "Recompute this round" : "Seed not yet revealed — rotate on the fairness page"}
                          >
                            verify
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Balance rail */}
        <aside className="panel panel-glow panel-etched p-5 h-fit lg:sticky lg:top-24 order-1 lg:order-2">
          <div className="kicker mb-2">App balance</div>
          <div className="stat-number text-[2.2rem] text-neon leading-none mb-1">
            {me.signedIn ? (me.credits ?? 0).toLocaleString() : "—"}
          </div>
          <p className="text-xs mb-5" style={{ color: "var(--text-dim)" }}>
            whole $OWP you can wager or withdraw
          </p>

          {!me.signedIn ? (
            <Notice kind="info">
              Connect your wallet and sign in (top right) to deposit $OWP and
              take a seat.
            </Notice>
          ) : !mintLive ? (
            <Notice kind="info">
              $OWP is not live yet. Deposits open once the mint is published.
            </Notice>
          ) : (
            <>
              <label className="kicker !text-[0.6rem]">Deposit $OWP</label>
              {house.creditSalesPaused && (
                <div className="mt-1.5">
                  <Notice kind="info">
                    Deposits are paused by the house — back shortly.
                  </Notice>
                </div>
              )}
              <div className="flex gap-2 mt-1.5 mb-2">
                <input
                  type="number"
                  className="input"
                  min={1}
                  step={1}
                  aria-label="Amount of $OWP to deposit"
                  value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                />
                <button
                  className="btn btn-primary"
                  onClick={doDeposit}
                  disabled={busy || !depositValid || house.creditSalesPaused}
                >
                  {busy ? "…" : "Deposit"}
                </button>
              </div>
              <div className="flex gap-1.5 mb-2.5">
                {[100, 500, 1_000].map((amt) => (
                  <button
                    key={amt}
                    className="btn btn-ghost !text-xs !min-h-[1.8rem] !px-2.5"
                    onClick={() => setDepositAmount(amt)}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                The transfer goes to the treasury wallet and shows up here as
                your balance. Wagers, bids, and bounty entries spend that
                balance. Withdrawals are requested from your account and paid
                automatically.
              </p>
              <details className="mb-3">
                <summary className="text-xs cursor-pointer" style={{ color: "var(--text-dim)" }}>
                  Sent $OWP but the balance didn&apos;t move?
                </summary>
                <div className="flex gap-2 mt-2">
                  <input
                    className="input !text-xs mono flex-1"
                    placeholder="Paste the transaction signature"
                    value={rescueSig}
                    onChange={(e) => setRescueSig(e.target.value)}
                  />
                  <button
                    className="btn btn-ghost !text-xs"
                    disabled={busy || rescueSig.trim().length < 64}
                    onClick={doRescue}
                  >
                    Redeem
                  </button>
                </div>
                <p className="text-[0.65rem] mt-1.5 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  We verify the transfer on-chain and credit it once. Safe to retry.
                </p>
              </details>
              <Link href="/account" className="btn btn-ghost w-full mb-3">
                Withdraw
              </Link>
              {CLIENT_CONFIG.devFaucet && (
                <button className="btn btn-ghost w-full mb-3" onClick={doFaucet} disabled={busy}>
                  Dev faucet · +100 $OWP
                </button>
              )}
            </>
          )}

          {msg && (
            <div className="mt-2">
              <Notice kind={msg.kind}>{msg.text}</Notice>
            </div>
          )}

          {(house.rankedMinBurnedRibbit > 0 || house.rankedMinWindowBurnedRibbit > 0) && (
            <div
              className="mt-4 rounded-lg p-3 text-xs leading-relaxed"
              style={{
                background: "oklch(0.78 0.12 85 / 0.06)",
                border: "1px solid oklch(0.78 0.12 85 / 0.25)",
              }}
            >
              <span className="text-gold">🏆 Two steps to win prizes.</span>{" "}
              <b>1) Deposit $OWP to become eligible</b> —{" "}
              {house.rankedMinBurnedRibbit.toLocaleString()} $OWP deposited
              lifetime, plus {house.rankedMinWindowBurnedRibbit.toLocaleString()}{" "}
              $OWP deposited during each bounty you enter. <b>2) Play the game</b>{" "}
              — wagers fill the shared pool everyone splits.
            </div>
          )}

          <div
            className="mt-4 pt-4 text-xs leading-relaxed"
            style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-dim)" }}
          >
            House edge is a flat {Math.round(house.houseEdge * 100)}% on table
            payouts, taken in $OWP. Bounty pots are filled from that edge.{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              Verify fairness →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
