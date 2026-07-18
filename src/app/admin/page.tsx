"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle, StatCard } from "@/components/ui";
import { ImageUploadField } from "@/components/image-upload";
import { CLIENT_CONFIG, fmtRibbit, shortWallet } from "@/lib/client-config";

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
    status: string;
    kind: string;
    user: { wallet: string };
  }[];
  liveAuctions: number;
  openBounties: number;
  unfulfilled: {
    id: string;
    title: string;
    currentRaw: string;
    winnerUserId: string | null;
    bids: number;
  }[];
  stats: {
    users: number;
    creditsOutstanding: number;
    lifetimeBurnedRaw: string;
    lockedRaw: string;
    treasury: {
      configured: boolean;
      solBalance: number | null;
      ribbitBalance: number | null;
      wallet: string | null;
    };
  };
};

type ReviewEntry = {
  rank: number;
  wallet: string;
  value: number;
  entries: number;
  volume?: number;
  burnedRibbit: number;
  windowBurnedRibbit: number;
  walletAgeDays: number;
};
type Pool = { houseTakeCredits: number; poolCredits: number; share: number };
type Review = {
  bounty: {
    id: string;
    title: string;
    target: string | null;
    game: string;
    status: string;
    prize: string;
    prizeRibbit: number;
    endsAt: string;
  };
  unit: string;
  verified: boolean;
  entries: ReviewEntry[];
};
type PaidBounty = {
  id: string;
  title: string;
  paidAt: string | null;
  awards: { rank: number; wallet: string; amountRibbit: number; value: number }[];
};

type LiveAuction = {
  id: string;
  title: string;
  currentRaw: string;
  startBidRaw: string;
  endsAt: string;
  sellerWallet: string | null;
  _count: { bids: number };
};

// Prize-split presets. Percentages re-normalize server-side if fewer eligible
// winners exist, so the whole pot is always distributed.
const SPLIT_PRESETS: { key: string; label: string; splits: number[] }[] = [
  { key: "solo", label: "Winner takes all", splits: [100] },
  { key: "top3", label: "Top 3 · 60/30/10", splits: [60, 30, 10] },
  { key: "top5", label: "Top 5 · 40/25/15/12/8", splits: [40, 25, 15, 12, 8] },
];

function previewShares(prize: number, splits: number[], winners: number): number[] {
  const usable = splits.slice(0, Math.max(1, winners));
  const sum = usable.reduce((a, b) => a + b, 0);
  return usable.map((s) => Math.floor((prize * s) / sum));
}

export default function AdminPage() {
  const { me } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    autoPay: false,
  });
  const bountyIsFree = ["hopper", "frogris", "worm"].includes(bountyForm.game);
  // Mirror of the server's auto-derivation (lib/bounty.computeTriggerCreditVolume)
  // so the admin sees the threshold this prize will produce before creating it.
  const computedTrigger = Math.max(
    1,
    Math.ceil(
      ((bountyForm.prizeRibbit / CLIENT_CONFIG.ribbitPerCredit) *
        (1 + CLIENT_CONFIG.bountyHouseMargin)) /
        CLIENT_CONFIG.houseEdge
    )
  );

  const [review, setReview] = useState<Review[]>([]);
  const [paid, setPaid] = useState<PaidBounty[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([]);
  const [sigInputs, setSigInputs] = useState<Record<string, string>>({});
  const [splitChoice, setSplitChoice] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
    fetch("/api/admin/bounty-review")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.review)) {
          setReview(d.review);
          setPaid(Array.isArray(d.paid) ? d.paid : []);
          setPool(d.pool ?? null);
        }
      })
      .catch(() => {});
    fetch("/api/auctions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLiveAuctions(Array.isArray(d.live) ? d.live : []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (me.isAdmin) load();
  }, [me.isAdmin, load]);

  const act = async (url: string, body: unknown, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setMsg(res.ok ? (d.status ? `Done — ${d.status}.` : "Done.") : (d.error ?? "Failed"));
    setBusy(false);
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

  const s = data?.stats;
  const treasury = s?.treasury;

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

      {/* House vitals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Players" value={s ? s.users.toLocaleString() : "…"} />
        <StatCard
          label="Credits out"
          value={s ? s.creditsOutstanding.toLocaleString() : "…"}
          tone="neon"
        />
        <StatCard
          label="Lifetime burned"
          value={s ? `${fmtRibbit(s.lifetimeBurnedRaw)}` : "…"}
          sub="$RIBBIT"
          tone="gold"
        />
        <StatCard
          label="Escrow locked"
          value={s ? `${fmtRibbit(s.lockedRaw)}` : "…"}
          sub="$RIBBIT in bids"
        />
        <StatCard
          label="Treasury $RIBBIT"
          value={
            treasury?.configured && treasury.ribbitBalance !== null
              ? treasury.ribbitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : treasury?.configured
                ? "—"
                : "not set"
          }
          tone="portal"
        />
        <StatCard
          label="Treasury SOL"
          value={
            treasury?.configured && treasury.solBalance !== null
              ? treasury.solBalance.toFixed(3)
              : "—"
          }
        />
      </div>

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
                      disabled={busy}
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
                      disabled={busy}
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
          <h3 className="font-bold mb-4">Payout queue</h3>
          {!data || data.withdrawals.length === 0 ? (
            <p className="text-fog text-sm">Queue is empty.</p>
          ) : (
            <div className="space-y-3">
              {data.withdrawals.map((w) => (
                <div key={w.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm">
                      <span className="stat-number text-neon">{fmtRibbit(w.amountRaw)}</span>{" "}
                      RIBBIT → {shortWallet(w.destination)}
                    </div>
                    <div className="flex gap-1.5">
                      <span className={`badge ${w.kind === "bounty" ? "badge-gold" : ""}`}>
                        {w.kind === "bounty" ? "prize" : "withdrawal"}
                      </span>
                      {w.status === "processing" && (
                        <span className="badge badge-live">processing</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="input !text-xs flex-1"
                      placeholder="Payout tx signature"
                      value={sigInputs[w.id] ?? ""}
                      onChange={(e) =>
                        setSigInputs((p) => ({ ...p, [w.id]: e.target.value }))
                      }
                    />
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy || (sigInputs[w.id] ?? "").length < 64}
                      onClick={() =>
                        act(`/api/admin/withdrawals/${w.id}`, {
                          action: "mark_sent",
                          signature: sigInputs[w.id],
                        })
                      }
                    >
                      Mark sent
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/admin/withdrawals/${w.id}`,
                          { action: "reject" },
                          "Reject and refund this payout?"
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-fog mt-4">
            Run <code className="text-neon">node scripts/payout-worker.mjs</code> with the
            payout hot-wallet keypair (separate from the treasury) to pay the
            whole queue — withdrawals + prizes — automatically.
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
            <button
              className="btn btn-portal w-full"
              disabled={busy || auctionForm.title.length < 3}
              onClick={() => act("/api/admin/auctions", auctionForm)}
            >
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
            <label className="flex items-center gap-2 text-sm text-fog cursor-pointer">
              <input
                type="checkbox"
                checked={bountyForm.autoPay}
                onChange={(e) => setBountyForm({ ...bountyForm, autoPay: e.target.checked })}
              />
              Auto-pay every eligible winner pro-rata when triggered
            </label>
            {bountyForm.autoPay && !bountyIsFree && (
              <div
                className="panel p-3 text-xs leading-relaxed"
                style={{ color: "var(--text-dim)" }}
              >
                Auto-triggers after{" "}
                <span className="stat-number text-neon">
                  {computedTrigger.toLocaleString()}
                </span>{" "}
                credits are wagered on {bountyForm.game} — derived from the prize so
                the house edge-take on that play covers it plus{" "}
                {Math.round(CLIENT_CONFIG.bountyHouseMargin * 100)}% margin. Set the
                prize; the threshold follows automatically.
              </div>
            )}
            {bountyForm.autoPay && bountyIsFree && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Free game — pays out weekly (at the duration you set) to every eligible winner.
              </p>
            )}
            <button
              className="btn btn-portal w-full"
              disabled={busy || bountyForm.title.length < 3}
              onClick={() => act("/api/admin/bounties", bountyForm)}
            >
              Create bounty
            </button>
          </div>
        </div>
      </div>

      {/* Auction management */}
      <div className="mt-8">
        <div className="kicker mb-3">Auction management</div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="panel p-6">
            <h3 className="font-bold mb-4">Live lots</h3>
            {liveAuctions.length === 0 ? (
              <p className="text-fog text-sm">No live auctions.</p>
            ) : (
              <div className="space-y-3">
                {liveAuctions.map((a) => (
                  <div key={a.id} className="panel p-4">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-xs text-fog">{a._count.bids} bids</span>
                    </div>
                    <p className="text-xs text-fog mb-3">
                      {BigInt(a.currentRaw) > 0n
                        ? `current ${fmtRibbit(a.currentRaw)}`
                        : `opening ${fmtRibbit(a.startBidRaw)}`}{" "}
                      RIBBIT · {a.sellerWallet ? `consigned ${shortWallet(a.sellerWallet)}` : "house lot"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost text-xs"
                        disabled={busy}
                        onClick={() =>
                          act(
                            `/api/admin/auctions/${a.id}`,
                            { action: "end_now" },
                            "End this auction now and settle to the current high bidder?"
                          )
                        }
                      >
                        End &amp; settle now
                      </button>
                      <button
                        className="btn btn-ghost text-xs !text-danger"
                        disabled={busy}
                        onClick={() =>
                          act(
                            `/api/admin/auctions/${a.id}`,
                            { action: "cancel" },
                            "Cancel this auction and refund the high bidder?"
                          )
                        }
                      >
                        Cancel &amp; refund
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-6">
            <h3 className="font-bold mb-4">Awaiting delivery</h3>
            {!data || data.unfulfilled.length === 0 ? (
              <p className="text-fog text-sm">Nothing to fulfil — settled lots are all delivered.</p>
            ) : (
              <div className="space-y-3">
                {data.unfulfilled.map((a) => (
                  <div key={a.id} className="panel p-4">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-medium">{a.title}</span>
                      <span className="badge badge-gold">
                        {fmtRibbit(a.currentRaw)} RIBBIT
                      </span>
                    </div>
                    <p className="text-xs text-fog mb-3">
                      won by {a.winnerUserId ? "a hunter" : "—"} · {a.bids} bids · coordinate
                      delivery, then mark it below
                    </p>
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy}
                      onClick={() => {
                        const note = prompt("Delivery note (tracking / tx / handoff detail, optional):") ?? "";
                        act(`/api/admin/auctions/${a.id}`, { action: "mark_fulfilled", note });
                      }}
                    >
                      Mark delivered
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bounty payouts */}
      <div className="mt-8">
        <div className="kicker mb-3">Bounty payouts</div>
        {pool && (
          <div className="panel p-4 text-sm flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4">
            <span>
              <span className="text-fog">This week&apos;s sustainable pool: </span>
              <span className="stat-number text-neon">
                {pool.poolCredits.toLocaleString()} credits
              </span>
            </span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              {Math.round(pool.share * 100)}% of {pool.houseTakeCredits.toLocaleString()}{" "}
              credits realized house take — keep total prizes at or under this.
            </span>
          </div>
        )}

        {review.length === 0 ? (
          <p className="text-fog text-sm">No leaderboard bounties awaiting payout.</p>
        ) : (
          <div className="space-y-4">
            {review.map((r) => {
              const choiceKey = splitChoice[r.bounty.id] ?? "solo";
              const preset =
                SPLIT_PRESETS.find((p) => p.key === choiceKey) ?? SPLIT_PRESETS[0];
              const shares = previewShares(
                r.bounty.prizeRibbit,
                preset.splits,
                r.entries.length
              );
              return (
                <div key={r.bounty.id} className="panel p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                    <span className="font-medium tracking-tight">{r.bounty.title}</span>
                    {r.bounty.target && (
                      <span className="mono text-xs text-gold uppercase tracking-wider">
                        {r.bounty.target}
                      </span>
                    )}
                    <span className="badge badge-gold">{r.bounty.prize}</span>
                    <span className={`badge ${r.bounty.status === "closed" ? "badge-portal" : ""}`}>
                      {r.bounty.status}
                    </span>
                    {r.verified ? (
                      <span className="badge badge-live">replay-verified</span>
                    ) : (
                      <span className="badge">heuristic checks</span>
                    )}
                    <span className="kicker !text-[0.6rem] ml-auto">{r.unit}</span>
                  </div>
                  {r.entries.length === 0 ? (
                    <p className="text-fog text-sm">No eligible winners yet — nothing to pay.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {r.entries.map((e, i) => (
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
                                  <span style={{ color: "var(--text-dim)" }}>
                                    {" "}· {e.windowBurnedRibbit.toLocaleString()} in window
                                  </span>
                                </td>
                                <td className="py-1.5 pr-3 text-xs text-right" style={{ color: "var(--text-dim)" }}>
                                  wallet {e.walletAgeDays}d
                                </td>
                                <td className="py-1.5 text-right stat-number text-gold text-xs">
                                  {i < shares.length ? `${shares[i].toLocaleString()} $RIBBIT` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        <select
                          className="input !text-xs max-w-56"
                          value={choiceKey}
                          onChange={(e) =>
                            setSplitChoice((p) => ({ ...p, [r.bounty.id]: e.target.value }))
                          }
                        >
                          {SPLIT_PRESETS.map((p) => (
                            <option key={p.key} value={p.key}>{p.label}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary text-xs"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/admin/bounties/${r.bounty.id}`,
                              { action: "award", splits: preset.splits },
                              `Pay ${r.bounty.prize} to the top ${Math.min(preset.splits.length, r.entries.length)} — this queues real $RIBBIT payouts and cannot be undone. Proceed?`
                            )
                          }
                        >
                          Award &amp; pay
                        </button>
                        <button
                          className="btn btn-ghost text-xs"
                          disabled={busy || r.bounty.status !== "open"}
                          onClick={() =>
                            act(`/api/admin/bounties/${r.bounty.id}`, { action: "close" })
                          }
                        >
                          Close early
                        </button>
                        <button
                          className="btn btn-ghost text-xs !text-danger"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/admin/bounties/${r.bounty.id}`,
                              { action: "cancel" },
                              "Cancel this bounty with no payout?"
                            )
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {paid.length > 0 && (
          <div className="mt-6">
            <div className="kicker mb-3">Recently paid</div>
            <div className="space-y-3">
              {paid.map((b) => (
                <div key={b.id} className="panel p-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-medium">{b.title}</span>
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {b.paidAt ? new Date(b.paidAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fog">
                    {b.awards.map((a) => (
                      <span key={a.rank}>
                        <span style={{ color: "var(--text-dim)" }}>#{a.rank}</span>{" "}
                        {shortWallet(a.wallet)}{" "}
                        <span className="text-gold">{a.amountRibbit.toLocaleString()} $RIBBIT</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
