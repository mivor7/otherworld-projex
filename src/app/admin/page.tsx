"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { ImageUploadField } from "@/components/image-upload";
import { fmtRibbit, shortWallet } from "@/lib/client-config";

type Overview = {
  applications: {
    id: string;
    title: string;
    description: string;
    askRaw: string;
    category: string;
    contact: string | null;
    user: { wallet: string };
  }[];
  withdrawals: {
    id: string;
    amountRaw: string;
    destination: string;
    user: { wallet: string };
  }[];
  liveAuctions: number;
  openBounties: number;
};

type ReviewEntry = {
  rank: number;
  wallet: string;
  value: number;
  entries: number;
  volume?: number;
  burnedRibbit: number;
  walletAgeDays: number;
};
type Review = {
  bounty: { id: string; title: string; target: string | null; game: string; prize: string; endsAt: string };
  unit: string;
  verified: boolean;
  entries: ReviewEntry[];
};

export default function AdminPage() {
  const { me } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [auctionForm, setAuctionForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    startBidRibbit: 1000,
    minIncrementRibbit: 100,
    durationHours: 72,
  });
  const [bountyForm, setBountyForm] = useState({
    title: "",
    description: "",
    target: "",
    game: "hopper",
    prizeRibbit: 5000,
    durationDays: 7,
  });

  const [review, setReview] = useState<Review[]>([]);

  const load = useCallback(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
    fetch("/api/admin/bounty-review")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => Array.isArray(rows) && setReview(rows))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (me.isAdmin) load();
  }, [me.isAdmin, load]);

  const act = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setMsg(res.ok ? "Done." : (d.error ?? "Failed"));
    load();
  };

  if (!me.signedIn || !me.isAdmin) {
    return (
      <div className="pt-20 max-w-md mx-auto">
        <Notice kind="info">
          Admin console — sign in with a wallet listed in ADMIN_WALLETS.
        </Notice>
      </div>
    );
  }

  return (
    <div className="pt-10">
      <SectionTitle
        kicker="Operations"
        title="Admin console"
        desc={`Live auctions: ${data?.liveAuctions ?? "…"} · open bounties: ${data?.openBounties ?? "…"}`}
      />
      {msg && (
        <div className="mb-4">
          <Notice kind="info">{msg}</Notice>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="panel p-6">
          <h3 className="font-bold mb-4">Pending listing applications</h3>
          {!data || data.applications.length === 0 ? (
            <p className="text-fog text-sm">Nothing waiting for review.</p>
          ) : (
            <div className="space-y-4">
              {data.applications.map((a) => (
                <div key={a.id} className="panel p-4">
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="font-semibold">{a.title}</span>
                    <span className="badge">{a.category}</span>
                  </div>
                  <p className="text-fog text-sm mb-2">{a.description}</p>
                  <p className="text-xs text-fog mb-3">
                    seller {shortWallet(a.user.wallet)} · ask {fmtRibbit(a.askRaw)} RIBBIT
                    {a.contact && ` · ${a.contact}`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary text-xs"
                      onClick={() =>
                        act(`/api/admin/applications/${a.id}`, {
                          action: "approve",
                          durationHours: 72,
                        })
                      }
                    >
                      Approve → 72h auction
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() =>
                        act(`/api/admin/applications/${a.id}`, { action: "reject" })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-6">
          <h3 className="font-bold mb-4">Pending withdrawals</h3>
          {!data || data.withdrawals.length === 0 ? (
            <p className="text-fog text-sm">Queue is empty.</p>
          ) : (
            <div className="space-y-3">
              {data.withdrawals.map((w) => (
                <div key={w.id} className="panel p-4">
                  <div className="text-sm mb-2">
                    <span className="stat-number text-neon">{fmtRibbit(w.amountRaw)}</span>{" "}
                    RIBBIT → {shortWallet(w.destination)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary text-xs"
                      onClick={() => {
                        const sig = prompt("Payout tx signature (after sending from treasury):");
                        if (sig) act(`/api/admin/withdrawals/${w.id}`, { action: "mark_sent", signature: sig });
                      }}
                    >
                      Mark sent
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => act(`/api/admin/withdrawals/${w.id}`, { action: "reject" })}
                    >
                      Reject & refund
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-fog mt-4">
            Tip: run <code className="text-neon">npm run payout-worker</code> with the
            treasury keypair to pay the queue automatically.
          </p>
        </div>

        <div className="panel p-6">
          <h3 className="font-bold mb-4">Create house auction</h3>
          <div className="space-y-3">
            <input className="input" placeholder="Title" value={auctionForm.title}
              onChange={(e) => setAuctionForm({ ...auctionForm, title: e.target.value })} />
            <textarea className="input" placeholder="Description" value={auctionForm.description}
              onChange={(e) => setAuctionForm({ ...auctionForm, description: e.target.value })} />
            <ImageUploadField
              value={auctionForm.imageUrl}
              onChange={(url) => setAuctionForm({ ...auctionForm, imageUrl: url })}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-fog">Start bid</label>
                <input className="input" type="number" value={auctionForm.startBidRibbit}
                  onChange={(e) => setAuctionForm({ ...auctionForm, startBidRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Min step</label>
                <input className="input" type="number" value={auctionForm.minIncrementRibbit}
                  onChange={(e) => setAuctionForm({ ...auctionForm, minIncrementRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Hours</label>
                <input className="input" type="number" value={auctionForm.durationHours}
                  onChange={(e) => setAuctionForm({ ...auctionForm, durationHours: Number(e.target.value) })} />
              </div>
            </div>
            <button className="btn btn-portal w-full" onClick={() => act("/api/admin/auctions", auctionForm)}>
              Create auction
            </button>
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="font-bold mb-4">Create bounty</h3>
          <div className="space-y-3">
            <input className="input" placeholder="Title" value={bountyForm.title}
              onChange={(e) => setBountyForm({ ...bountyForm, title: e.target.value })} />
            <textarea className="input" placeholder="Description" value={bountyForm.description}
              onChange={(e) => setBountyForm({ ...bountyForm, description: e.target.value })} />
            <input className="input" placeholder="Target (e.g. The Highway Bandit)" value={bountyForm.target}
              onChange={(e) => setBountyForm({ ...bountyForm, target: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-fog">Game</label>
                <select className="input" value={bountyForm.game}
                  onChange={(e) => setBountyForm({ ...bountyForm, game: e.target.value })}>
                  <option value="hopper">Hopper</option>
                  <option value="frogris">Frogris</option>
                  <option value="worm">Worm Frog</option>
                  <option value="flip">Frog Flip</option>
                  <option value="dice">Pond Dice</option>
                  <option value="blackjack">Blackjack</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-fog">Prize RIBBIT</label>
                <input className="input" type="number" value={bountyForm.prizeRibbit}
                  onChange={(e) => setBountyForm({ ...bountyForm, prizeRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Days</label>
                <input className="input" type="number" value={bountyForm.durationDays}
                  onChange={(e) => setBountyForm({ ...bountyForm, durationDays: Number(e.target.value) })} />
              </div>
            </div>
            <button className="btn btn-portal w-full" onClick={() => act("/api/admin/bounties", bountyForm)}>
              Create bounty
            </button>
          </div>
        </div>
      </div>

      {/* Payout review — who's actually winning each open pool */}
      {review.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="kicker">Payout review — open leaderboard bounties</div>
          {review.map((r) => (
            <div key={r.bounty.id} className="panel p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <span className="font-medium tracking-tight">{r.bounty.title}</span>
                {r.bounty.target && (
                  <span className="mono text-xs text-gold uppercase tracking-wider">
                    {r.bounty.target}
                  </span>
                )}
                <span className="badge badge-gold">{r.bounty.prize}</span>
                {r.verified ? (
                  <span className="badge badge-live">replay-verified</span>
                ) : (
                  <span className="badge">heuristic checks</span>
                )}
                <span className="kicker !text-[0.6rem] ml-auto">{r.unit}</span>
              </div>
              {r.entries.length === 0 ? (
                <p className="text-fog text-sm">No ranked entries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {r.entries.map((e) => (
                        <tr key={e.rank} className="table-row">
                          <td className="py-1.5 pr-2 mono text-xs" style={{ color: "var(--text-dim)" }}>
                            {String(e.rank).padStart(2, "0")}
                          </td>
                          <td className="py-1.5 pr-3 mono text-xs">{shortWallet(e.wallet)}</td>
                          <td className="py-1.5 pr-3 stat-number">{e.value.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-xs text-fog">
                            {e.entries} {e.volume !== undefined ? `rounds · ${e.volume} wagered` : "runs"}
                          </td>
                          <td className="py-1.5 pr-3 text-xs text-fog">
                            {e.burnedRibbit.toLocaleString()} burned
                          </td>
                          <td className="py-1.5 text-xs text-right" style={{ color: "var(--text-dim)" }}>
                            wallet {e.walletAgeDays}d old
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
