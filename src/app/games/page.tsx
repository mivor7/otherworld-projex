"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";
import { useHouseConfig } from "@/components/use-house-config";
import { PageHero } from "@/components/hero";
import { MatteMedia } from "@/components/matte-media";
import { Notice } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";

const GAMES = [
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
  {
    href: "/games/hopper",
    image: "/art/owp_frogger.png",
    name: "Hopper",
    desc: "Free arcade action — cross the traffic, climb the weekly bounty board.",
    badge: "Free · bounty",
  },
  {
    href: "/games/frogris",
    image: "/art/owp_frogris.png",
    name: "Frogris",
    desc: "The falling-block episode. Clear lines, chase levels, top the weekly board.",
    badge: "Free · bounty",
  },
  {
    href: "/games/worm",
    image: "/art/owp_worm.png",
    name: "Worm Frog",
    desc: "Slither, grow, and don't bite your own tail. Ten points a fly.",
    badge: "Free · bounty",
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
  const { burnForCredits, buyCredits } = useChain();
  // Credits always route through the split-buy (part burned, part to the house)
  // when a treasury exists — so every credit funds the reward economy. Pure
  // burn is only the pre-treasury / dev fallback so credits are still
  // obtainable before the treasury is configured.
  const canBuy = !!CLIENT_CONFIG.treasuryWallet;
  const house = useHouseConfig(); // live, admin-tunable price/split/switches
  const [burnAmount, setBurnAmount] = useState(CLIENT_CONFIG.ribbitPerCredit * 10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [liveBounties, setLiveBounties] = useState<
    Record<string, { prizeRibbit: number; prizeText: string | null }>
  >({});

  useEffect(() => {
    if (!me.signedIn) return;
    fetch("/api/games/history")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setHistory(rows))
      .catch(() => {});
  }, [me.signedIn]);

  useEffect(() => {
    fetch("/api/bounties/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.games && setLiveBounties(d.games))
      .catch(() => {});
  }, []);

  const burnValid =
    Number.isFinite(burnAmount) && burnAmount >= house.ribbitPerCredit;
  const burnRemainder = burnValid ? burnAmount % house.ribbitPerCredit : 0;

  const doBurn = async () => {
    // Guard hard: a burn/buy below the credit price would spend tokens for
    // zero credits — the chain can't undo it.
    if (!burnValid) return;
    setBusy(true);
    setMsg(null);
    const res = canBuy ? await buyCredits(burnAmount) : await burnForCredits(burnAmount);
    if (res.ok) {
      setMsg({
        kind: "ok",
        text: `${canBuy ? "Purchase" : "Burn"} verified — ${res.data.creditsGranted} credits added.`,
      });
      await refresh();
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
        ? { kind: "ok", text: "100 demo credits added (dev faucet)." }
        : { kind: "err", text: "Faucet unavailable" }
    );
    await refresh();
    setBusy(false);
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
        subtitle="Casino tables run on credits bought with $RIBBIT — part burned forever, part funding the prize pools. Provably fair, published edge. The arcade episodes are free and pay weekly bounties."
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-8">
        <div className="grid sm:grid-cols-2 gap-4 content-start">
          {GAMES.map((g) => {
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
                      `${live.prizeRibbit.toLocaleString(undefined, { maximumFractionDigits: 0 })} $RIBBIT`}
                  </span>
                )}
              </div>
              <div className="card-body">
                <h3 className="!text-[1rem] group-hover:text-neon transition-colors">
                  {g.name}
                </h3>
                <p className="text-fog text-[0.85rem] leading-relaxed">
                  {g.href === "/games/flip"
                    ? `Frog or fly — call the flip. ${(2 * (1 - house.houseEdge)).toFixed(2)}× on a win.`
                    : g.href === "/games/dice"
                      ? `Set your own line, roll under it. Up to ${Math.floor(50 * (1 - house.houseEdge))}× payouts.`
                      : g.desc}
                </p>
                <div className="card-price-row">
                  <span className="card-price-label">
                    {live ? "Live bounty" : "Play"}
                  </span>
                  <span className="text-fog group-hover:text-neon transition-colors">→</span>
                </div>
              </div>
            </Link>
            );
          })}

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

        {/* Credits rail */}
        <aside className="panel panel-glow panel-etched p-5 h-fit lg:sticky lg:top-24">
          <div className="kicker mb-2">Play credits</div>
          <div className="stat-number text-[2.2rem] text-neon leading-none mb-5">
            {me.signedIn ? (me.credits ?? 0) : "—"}
          </div>

          {!me.signedIn ? (
            <Notice kind="info">
              Connect your wallet and sign in (top right) to get credits and
              take a seat.
            </Notice>
          ) : (
            <>
              <label className="kicker !text-[0.6rem]">
                {canBuy ? "Buy credits with $RIBBIT" : "Burn $RIBBIT → credits"}
              </label>
              {house.creditSalesPaused && (
                <div className="mt-1.5">
                  <Notice kind="info">
                    Credit sales are paused by the house — back shortly.
                  </Notice>
                </div>
              )}
              <div className="flex gap-2 mt-1.5 mb-2">
                <input
                  type="number"
                  className="input"
                  min={house.ribbitPerCredit}
                  step={house.ribbitPerCredit}
                  value={burnAmount}
                  onChange={(e) => setBurnAmount(Number(e.target.value))}
                />
                <button
                  className="btn btn-primary"
                  onClick={doBurn}
                  disabled={busy || !burnValid || house.creditSalesPaused}
                  title={
                    burnValid
                      ? undefined
                      : `Minimum ${house.ribbitPerCredit.toLocaleString()} $RIBBIT`
                  }
                >
                  {busy ? "…" : canBuy ? "Buy" : "Burn"}
                </button>
              </div>
              <div className="flex gap-1.5 mb-2.5">
                {[1_000, 5_000, 10_000].map((amt) => (
                  <button
                    key={amt}
                    className="btn btn-ghost !text-xs !min-h-[1.8rem] !px-2.5"
                    onClick={() => setBurnAmount(amt)}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                {house.ribbitPerCredit.toLocaleString()} $RIBBIT = 1 credit —
                you’ll receive{" "}
                <span className="text-neon">
                  {burnValid
                    ? Math.floor(burnAmount / house.ribbitPerCredit)
                    : 0}
                </span>
                .{" "}
                {burnRemainder > 0 && (
                  <span className="text-gold">
                    {burnRemainder.toLocaleString()} $RIBBIT of that {canBuy ? "spends" : "burns"} without
                    granting a credit — use a multiple of{" "}
                    {house.ribbitPerCredit.toLocaleString()}.{" "}
                  </span>
                )}
                {canBuy ? (
                  <>
                    {Math.round(house.buyBurnShare * 100)}% is burned,{" "}
                    {Math.round((1 - house.buyBurnShare) * 100)}% funds the
                    house — which pays the bounty rewards. Verified on-chain.
                  </>
                ) : (
                  <>Burns are permanent, 100% destroyed, and verified on-chain.</>
                )}
              </p>
              {CLIENT_CONFIG.devFaucet && (
                <button className="btn btn-ghost w-full mb-3" onClick={doFaucet} disabled={busy}>
                  Dev faucet · +100 credits
                </button>
              )}
            </>
          )}

          {msg && (
            <div className="mt-2">
              <Notice kind={msg.kind}>{msg.text}</Notice>
            </div>
          )}

          <div
            className="mt-4 pt-4 text-xs leading-relaxed"
            style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-dim)" }}
          >
            House edge is a flat {Math.round(house.houseEdge * 100)}% on table
            payouts — it funds the bounty pools every purchase and wager feeds.{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              Verify fairness →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
