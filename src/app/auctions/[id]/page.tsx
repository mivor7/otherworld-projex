"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Countdown, Notice } from "@/components/ui";
import { LightboxImage } from "@/components/lightbox";
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
  const [loadError, setLoadError] = useState(false);
  const [bid, setBid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/auctions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setAuction(data);
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  if (!auction && loadError) {
    return (
      <div className="pt-24 text-center">
        <p className="text-fog mb-4">This lot could not be found.</p>
        <Link href="/auctions" className="btn btn-ghost">
          ← Back to the house
        </Link>
      </div>
    );
  }

  if (!auction) {
    return <div className="pt-24 text-center text-fog">Retrieving the lot…</div>;
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
      setMsg({ kind: "ok", text: "You hold the high bid." });
      load();
      await refresh();
    } else {
      setMsg({ kind: "err", text: data.error ?? "Bid failed" });
    }
    setBusy(false);
  };

  return (
    <div className="pt-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/auctions" className="text-fog hover:text-frost transition-colors">
          Auction House
        </Link>
        <span style={{ color: "var(--text-dim)" }}>/</span>
        <span className="kicker !normal-case !tracking-normal">{auction.title}</span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 items-start">
        {/* Media theater */}
        <div className="panel panel-glow overflow-hidden">
          <div
            className="relative aspect-[4/3] overflow-hidden"
            style={{ background: "oklch(0.09 0.006 270)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={auction.imageUrl ?? "/art/art-empty-chest.jpg"}
              alt=""
              aria-hidden
              className="media-matte-bg"
            />
            <LightboxImage
              src={auction.imageUrl ?? "/art/art-empty-chest.jpg"}
              alt={auction.title}
              className="media-matte-fg"
            />
            <div
              className="absolute inset-2.5 pointer-events-none rounded-md"
              style={{ border: "1px solid oklch(1 0 0 / 0.08)" }}
            />
          </div>
          <div className="p-6">
            <div className="flex gap-1.5 mb-3 flex-wrap">
              <span className="badge">{auction.category}</span>
              {auction.sellerWallet ? (
                <span className="badge badge-portal">
                  consigned · {auction.sellerWallet.slice(0, 4)}…
                </span>
              ) : (
                <span className="badge">house lot</span>
              )}
            </div>
            <h1 className="text-[1.4rem] mb-3">{auction.title}</h1>
            <p className="text-fog text-[0.9rem] leading-relaxed">{auction.description}</p>
          </div>
        </div>

        {/* Bid rail */}
        <div className="md:sticky md:top-24 space-y-4">
          <div className="panel panel-glow panel-etched p-6">
            <div className="flex justify-between items-start mb-5">
              <div>
                <div className="kicker mb-1.5">
                  {BigInt(auction.currentRaw) > 0n ? "Current bid" : "Opening bid"}
                </div>
                <div className="stat-number text-[2rem] text-neon leading-none">
                  {fmtRibbit(
                    BigInt(auction.currentRaw) > 0n ? auction.currentRaw : auction.startBidRaw
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                  $RIBBIT
                </div>
              </div>
              <div className="text-right">
                <div className="kicker mb-1.5">
                  {auction.status === "live" ? "Hammer in" : "Status"}
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
                    {busy ? "…" : "Place bid"}
                  </button>
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  {(
                    [
                      ["Min", 1],
                      ["+10%", 1.1],
                      ["+25%", 1.25],
                    ] as const
                  ).map(([label, mult]) => (
                    <button
                      key={label}
                      className="btn btn-ghost !text-xs !min-h-[1.8rem] !px-2.5"
                      onClick={() => setBid(Math.ceil(fromRawClient(minNext) * mult))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className="text-xs mt-3 space-y-1 leading-relaxed"
                  style={{ color: "var(--text-dim)" }}
                >
                  <p>
                    Minimum next bid {fmtRibbit(minNext)} · from your{" "}
                    <Link href="/auctions" className="text-neon hover:underline">
                      bidding account
                    </Link>{" "}
                    ({fmtRibbit(me.ribbitAvailable ?? 0)} available)
                  </p>
                  <p>Bids in the final 2 minutes extend the hammer by 2 minutes.</p>
                </div>
              </>
            )}
            {msg && (
              <div className="mt-3">
                <Notice kind={msg.kind}>{msg.text}</Notice>
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="kicker mb-3">Bid record</div>
            {auction.bids.length === 0 ? (
              <p className="text-fog text-sm">No bids yet — open the lot.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {auction.bids.map((b) => (
                    <tr key={b.id} className="table-row">
                      <td className="py-2 pr-2 mono text-xs">
                        {b.bidder}
                        {b.isYou && <span className="text-neon"> · you</span>}
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
