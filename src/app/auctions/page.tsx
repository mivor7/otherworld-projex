"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";
import { Countdown, Notice, SectionTitle } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";

type AuctionRow = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string;
  currentRaw: string;
  startBidRaw: string;
  endsAt: string;
  status: string;
  sellerWallet: string | null;
  _count: { bids: number };
};

function AuctionCard({ a }: { a: AuctionRow }) {
  const current = BigInt(a.currentRaw) > 0n ? a.currentRaw : a.startBidRaw;
  return (
    <Link
      href={`/auctions/${a.id}`}
      className="panel overflow-hidden hover:border-portal-dim transition-colors group"
    >
      <div className="h-36 bg-gradient-to-br from-portal-dim/30 via-surface-2 to-neon-dim/20 flex items-center justify-center overflow-hidden">
        {a.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl opacity-60">🏛️</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="badge">{a.category}</span>
          {a.status === "live" ? (
            <span className="badge badge-live">live</span>
          ) : (
            <span className="badge">{a.status}</span>
          )}
          {!a.sellerWallet && <span className="badge badge-portal">house</span>}
        </div>
        <h3 className="font-semibold group-hover:text-portal truncate">{a.title}</h3>
        <div className="flex justify-between items-end mt-2 text-sm">
          <div>
            <div className="text-xs text-fog">{BigInt(a.currentRaw) > 0n ? "current bid" : "starting bid"}</div>
            <div className="stat-number text-neon">{fmtRibbit(current)} RIBBIT</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-fog">{a._count.bids} bids</div>
            {a.status === "live" && <Countdown to={a.endsAt} />}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function AuctionsPage() {
  const { me, refresh } = useSession();
  const { depositForBidding } = useChain();
  const [live, setLive] = useState<AuctionRow[]>([]);
  const [past, setPast] = useState<AuctionRow[]>([]);
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/auctions")
      .then((r) => r.json())
      .then((d) => {
        setLive(d.live ?? []);
        setPast(d.past ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const doDeposit = async () => {
    setBusy(true);
    setMsg(null);
    const res = await depositForBidding(amount);
    setMsg(
      res.ok
        ? { kind: "ok", text: `Deposit verified — bidding balance updated.` }
        : { kind: "err", text: res.error }
    );
    await refresh();
    setBusy(false);
  };

  const doWithdraw = async () => {
    setBusy(true);
    setMsg(null);
    const raw = BigInt(me.ribbitAvailable ?? "0");
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountRaw: raw.toString() }),
    });
    const data = await res.json();
    setMsg(
      res.ok
        ? { kind: "ok", text: "Withdrawal queued — the treasury signer pays out shortly." }
        : { kind: "err", text: data.error ?? "Withdrawal failed" }
    );
    await refresh();
    setBusy(false);
  };

  return (
    <div className="pt-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle
          kicker="Auction house"
          title="Bid with $RIBBIT"
          desc="Escrowed bids, instant refunds when outbid, anti-snipe extensions. Community members can apply to list their own items."
        />
        <Link href="/auctions/apply" className="btn btn-portal">
          Apply to list an item
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          {live.length === 0 ? (
            <div className="panel p-10 text-center text-fog">
              No live auctions right now — check back soon or{" "}
              <Link href="/auctions/apply" className="text-portal hover:underline">
                apply to list something
              </Link>
              .
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {live.map((a) => (
                <AuctionCard key={a.id} a={a} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <>
              <h2 className="font-bold mt-10 mb-4 text-fog uppercase text-sm tracking-wider">
                Recently ended
              </h2>
              <div className="grid sm:grid-cols-2 gap-4 opacity-70">
                {past.map((a) => (
                  <AuctionCard key={a.id} a={a} />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="panel panel-glow p-6 h-fit sticky top-24">
          <h3 className="font-bold mb-3">Bidding balance</h3>
          {!me.signedIn ? (
            <Notice kind="info">Connect & sign in to deposit $RIBBIT and bid.</Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-xs text-fog uppercase tracking-wider">Available</div>
                  <div className="stat-number text-neon text-xl">
                    {fmtRibbit(me.ribbitAvailable ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-fog uppercase tracking-wider">Locked in bids</div>
                  <div className="stat-number text-portal text-xl">
                    {fmtRibbit(me.ribbitLocked ?? 0)}
                  </div>
                </div>
              </div>
              <label className="text-xs uppercase tracking-wider text-fog">
                Deposit $RIBBIT
              </label>
              <div className="flex gap-2 mt-2 mb-3">
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
                <button className="btn btn-primary" onClick={doDeposit} disabled={busy}>
                  {busy ? "…" : "Deposit"}
                </button>
              </div>
              <button
                className="btn btn-ghost w-full"
                onClick={doWithdraw}
                disabled={busy || BigInt(me.ribbitAvailable ?? "0") === 0n}
              >
                Withdraw available balance
              </button>
              <p className="text-xs text-fog mt-3 leading-relaxed">
                Deposits go to the treasury escrow and are verified on-chain.
                Outbid amounts unlock instantly; withdrawals are paid out by the
                treasury signer.
              </p>
            </>
          )}
          {msg && (
            <div className="mt-3">
              <Notice kind={msg.kind}>{msg.text}</Notice>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
