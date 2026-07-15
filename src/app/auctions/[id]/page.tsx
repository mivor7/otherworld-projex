"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Countdown, Notice, SectionTitle } from "@/components/ui";
import { fmtRibbit, fromRawClient, toRawClient } from "@/lib/client-config";

type BidRow = {
  id: string;
  amountRaw: string;
  status: string;
  createdAt: string;
  bidder: string;
  isYou: boolean;
};

type AuctionDetail = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  category: string;
  sellerWallet: string | null;
  startBidRaw: string;
  minIncrement: string;
  currentRaw: string;
  status: string;
  endsAt: string;
  bids: BidRow[];
};

export default function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { me, refresh } = useSession();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/auctions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setAuction)
      .catch(() => {});
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  if (!auction) {
    return <div className="pt-20 text-center text-fog">Loading auction…</div>;
  }

  const minNext =
    BigInt(auction.currentRaw) > 0n
      ? BigInt(auction.currentRaw) + BigInt(auction.minIncrement)
      : BigInt(auction.startBidRaw);
  const suggested = bid ?? Math.ceil(fromRawClient(minNext));
  const youAreHigh = auction.bids.some((b) => b.status === "active" && b.isYou);

  const placeBid = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/auctions/${id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountRaw: toRawClient(suggested).toString() }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ kind: "ok", text: "You're the highest bidder! 🐸" });
      load();
      await refresh();
    } else {
      setMsg({ kind: "err", text: data.error ?? "Bid failed" });
    }
    setBusy(false);
  };

  return (
    <div className="pt-10 max-w-4xl mx-auto">
      <Link href="/auctions" className="text-fog text-sm hover:text-neon">
        ← All auctions
      </Link>
      <div className="grid md:grid-cols-2 gap-6 mt-4">
        <div className="panel overflow-hidden">
          <div className="h-64 bg-gradient-to-br from-portal-dim/30 via-surface-2 to-neon-dim/20 flex items-center justify-center">
            {auction.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={auction.imageUrl} alt={auction.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-7xl opacity-60">🏛️</span>
            )}
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-2">
              <span className="badge">{auction.category}</span>
              {auction.sellerWallet ? (
                <span className="badge">community · {auction.sellerWallet.slice(0, 4)}…</span>
              ) : (
                <span className="badge badge-portal">house listing</span>
              )}
            </div>
            <SectionTitle title={auction.title} />
            <p className="text-fog text-sm leading-relaxed -mt-4">{auction.description}</p>
          </div>
        </div>

        <div>
          <div className="panel panel-glow p-6 mb-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs text-fog uppercase tracking-wider mb-1">
                  {BigInt(auction.currentRaw) > 0n ? "Current bid" : "Starting bid"}
                </div>
                <div className="stat-number text-3xl neon-text">
                  {fmtRibbit(BigInt(auction.currentRaw) > 0n ? auction.currentRaw : auction.startBidRaw)}
                </div>
                <div className="text-xs text-fog mt-0.5">$RIBBIT</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-fog uppercase tracking-wider mb-1">
                  {auction.status === "live" ? "Ends in" : "Status"}
                </div>
                {auction.status === "live" ? (
                  <Countdown to={auction.endsAt} />
                ) : (
                  <span className="badge">{auction.status}</span>
                )}
              </div>
            </div>

            {auction.status === "live" && (
              <>
                {youAreHigh && (
                  <div className="mb-3">
                    <Notice kind="ok">You hold the high bid.</Notice>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input"
                    min={Math.ceil(fromRawClient(minNext))}
                    value={suggested}
                    onChange={(e) => setBid(Number(e.target.value))}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={placeBid}
                    disabled={busy || !me.signedIn || youAreHigh}
                  >
                    {busy ? "…" : "Bid"}
                  </button>
                </div>
                <p className="text-xs text-fog mt-2">
                  Minimum next bid: {fmtRibbit(minNext)} $RIBBIT · paid from your{" "}
                  <Link href="/auctions" className="text-neon hover:underline">
                    deposited balance
                  </Link>{" "}
                  (available: {fmtRibbit(me.ribbitAvailable ?? 0)})
                </p>
                <p className="text-xs text-fog mt-1">
                  Bids in the final 2 minutes extend the auction by 2 minutes.
                </p>
              </>
            )}
            {msg && (
              <div className="mt-3">
                <Notice kind={msg.kind}>{msg.text}</Notice>
              </div>
            )}
          </div>

          <div className="panel p-5">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-fog">
              Bid history
            </h3>
            {auction.bids.length === 0 ? (
              <p className="text-fog text-sm">No bids yet — set the pace.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {auction.bids.map((b) => (
                    <tr key={b.id} className="table-row">
                      <td className="py-2 pr-2">
                        {b.bidder}
                        {b.isYou && <span className="text-neon"> (you)</span>}
                      </td>
                      <td className="py-2 pr-2 stat-number text-right">
                        {fmtRibbit(b.amountRaw)}
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className={`badge ${
                            b.status === "active"
                              ? "badge-live"
                              : b.status === "won"
                                ? "badge-gold"
                                : ""
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
