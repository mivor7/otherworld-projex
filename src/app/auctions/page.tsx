"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";
import { PageHero } from "@/components/hero";
import { Countdown, Notice } from "@/components/ui";
import { LotCardSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { MatteMedia } from "@/components/matte-media";
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

function LotCard({ a, now }: { a: AuctionRow; now: number }) {
  const current = BigInt(a.currentRaw) > 0n ? a.currentRaw : a.startBidRaw;
  const msLeft = new Date(a.endsAt).getTime() - now;
  const urgent = a.status === "live" && msLeft > 0 && msLeft < 60 * 60 * 1000;
  return (
    <Link href={`/auctions/${a.id}`} className="lot-card group">
      <div className="card-media">
        {a.imageUrl ? (
          <MatteMedia src={a.imageUrl} alt={a.title} />
        ) : (
          <MatteMedia src="/art/art-empty-chest.jpg" />
        )}
        {urgent && (
          <span className="badge badge-urgent absolute top-2 right-2">
            Ending soon
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="badge">{a.category}</span>
          {a.status === "live" ? (
            <span className="badge badge-live">
              <span className="live-dot" /> live
            </span>
          ) : (
            <span className="badge">{a.status}</span>
          )}
          {a.sellerWallet ? (
            <span className="badge badge-portal">consigned</span>
          ) : (
            <span className="badge">house</span>
          )}
        </div>
        <h3 className="mt-1 line-clamp-2">{a.title}</h3>
        <div className="card-price-row">
          <div>
            <div className="card-price-label">
              {BigInt(a.currentRaw) > 0n ? "Current bid" : "Opening bid"}
            </div>
            <div className="price text-neon">
              {fmtRibbit(current)} <span className="text-fog text-xs font-normal">RIBBIT</span>
            </div>
          </div>
          <div className="text-right">
            <div className="card-price-label">{a._count.bids} bids</div>
            {a.status === "live" && (
              <div className="text-[0.8rem]">
                <Countdown to={a.endsAt} />
              </div>
            )}
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
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"live" | "ending" | "past">("live");
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    fetch("/api/auctions")
      .then((r) => r.json())
      .then((d) => {
        setLive(d.live ?? []);
        setPast(d.past ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setLive([]);
        setPast([]);
        setLoaded(true);
      });
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const depositValid = Number.isFinite(amount) && amount >= 1;

  const doDeposit = async () => {
    if (!depositValid) return;
    setBusy(true);
    setMsg(null);
    const res = await depositForBidding(amount);
    setMsg(
      res.ok
        ? { kind: "ok", text: "Deposit verified — bidding balance updated." }
        : { kind: "err", text: res.error }
    );
    await refresh();
    setBusy(false);
  };

  const doWithdraw = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const raw = BigInt(me.ribbitAvailable ?? "0");
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRaw: raw.toString() }),
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? { kind: "ok", text: "Withdrawal queued — the payout worker sends it shortly." }
          : { kind: "err", text: data.error ?? "Withdrawal failed" }
      );
      await refresh();
    } catch {
      setMsg({ kind: "err", text: "Network error — try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const ending = live.filter(
    (a) => new Date(a.endsAt).getTime() - now < 60 * 60 * 1000
  );
  const shown = filter === "live" ? live : filter === "ending" ? ending : past;

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/hero-auction.jpg"
        imagePosition="70% 48%"
        kicker="Wing II — under the gavel"
        badge={`${live.length} lots live`}
        title="The"
        titleAccent="Auction House"
        subtitle="Escrowed $RIBBIT bids, instant refunds when outbid, two-minute anti-snipe closings. Community members consign their own lots."
        actions={
          <Link href="/auctions/apply" className="btn btn-portal">
            Apply to consign a lot
          </Link>
        }
      />

      <div className="mt-6">
        <Notice kind="info">
          <span className="font-medium text-frost">The Auction House is under
          development.</span> Lots require admin approval, and the bidding flow
          is still being finished — feel free to look around, but expect rough
          edges here while the other wings are live.
        </Notice>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 mt-8">
        <div>
          <div className="chips mb-5">
            {(
              [
                ["live", `Live · ${live.length}`],
                ["ending", `Ending soon · ${ending.length}`],
                ["past", `Past · ${past.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`chip ${filter === key ? "active" : ""}`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {!loaded ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <LotCardSkeleton />
              <LotCardSkeleton />
              <LotCardSkeleton />
              <LotCardSkeleton />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              image="/art/art-empty-chest.jpg"
              title="Nothing under the gavel here"
              hint="New lots go live as consignments clear review — or put your own on the block."
              action={
                <Link href="/auctions/apply" className="btn btn-portal">
                  Consign a lot →
                </Link>
              }
            />
          ) : (
            <div
              className={`grid sm:grid-cols-2 gap-4 ${filter === "past" ? "opacity-70" : ""}`}
            >
              {shown.map((a) => (
                <LotCard key={a.id} a={a} now={now} />
              ))}
            </div>
          )}
        </div>

        <aside className="panel panel-glow panel-etched p-5 h-fit lg:sticky lg:top-24">
          <div className="kicker mb-3">Bidding account</div>
          {!me.signedIn ? (
            <Notice kind="info">
              Connect &amp; sign in to deposit $RIBBIT and bid on lots.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <div className="kicker !text-[0.6rem] mb-1">Available</div>
                  <div className="stat-number text-neon text-lg">
                    {fmtRibbit(me.ribbitAvailable ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="kicker !text-[0.6rem] mb-1">In bids</div>
                  <div className="stat-number text-lg">
                    {fmtRibbit(me.ribbitLocked ?? 0)}
                  </div>
                </div>
              </div>
              <label className="kicker !text-[0.6rem]">Deposit $RIBBIT</label>
              <div className="flex gap-2 mt-1.5 mb-2.5">
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
                <button
                  className="btn btn-primary"
                  onClick={doDeposit}
                  disabled={busy || !depositValid}
                >
                  {busy ? "…" : "Deposit"}
                </button>
              </div>
              <div className="flex gap-1.5 mb-2.5">
                {[1_000, 5_000, 25_000].map((amt) => (
                  <button
                    key={amt}
                    className="btn btn-ghost !text-xs !min-h-[1.8rem] !px-2.5"
                    onClick={() => setAmount(amt)}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-ghost w-full"
                onClick={doWithdraw}
                disabled={busy || BigInt(me.ribbitAvailable ?? "0") === 0n}
              >
                Withdraw available balance
              </button>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                Deposits are held in treasury escrow and verified on-chain.
                Outbid amounts release instantly.
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
