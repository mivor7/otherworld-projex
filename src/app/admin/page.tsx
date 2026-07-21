"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";
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
    payout: {
      configured: boolean;
      solBalance: number | null;
      ribbitBalance: number | null;
      wallet: string | null;
    };
  };
};

type Pulse = {
  active24: number;
  active7d: number;
  newUsers24: number;
  newUsers7d: number;
  rounds24: number;
  wagered24: number;
  ribbitIn24: number;
  topPlayers: { wallet: string; rounds: number; volume: number; net: number }[];
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

type HouseSettingRow = {
  key: string;
  label: string;
  desc: string;
  group: "Economy" | "Limits" | "Eligibility" | "Switches";
  kind: "number" | "share" | "bool";
  min: number | null;
  max: number | null;
  integer: boolean;
  danger: boolean;
  envDefault: number | boolean;
  effective: number | boolean;
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

type ManagedBounty = {
  id: string;
  title: string;
  target: string | null;
  game: string | null;
  kind: string;
  prizeRibbit: number;
  status: string;
  autoPay: boolean;
  triggerCreditVolume: number | null;
  endsAt: string;
  awards: number;
};

type PlayerProfile = {
  wallet: string;
  isBanned: boolean;
  credits: number;
  ribbitBalance: string;
  ribbitLocked: string;
  burnedRibbit: number;
  boughtRibbit: number;
  createdAt: string;
  counts: { burns: number; purchases: number; rounds: number; scores: number; bids: number; withdrawals: number };
};

// Prize-split presets. Percentages re-normalize server-side if fewer eligible
// winners exist, so the whole pot is always distributed.
const SPLIT_PRESETS: { key: string; label: string; splits: number[] }[] = [
  { key: "solo", label: "Winner takes all", splits: [100] },
  { key: "top3", label: "Top 3 · 60/30/10", splits: [60, 30, 10] },
  { key: "top5", label: "Top 5 · 40/25/15/12/8", splits: [40, 25, 15, 12, 8] },
];

// One-click bounty templates — fill the whole create form for a game, then tweak.
const BOUNTY_PRESETS: {
  label: string;
  title: string;
  description: string;
  target: string;
  game: string;
  prizeRibbit: number;
  durationDays: number;
  autoPay: boolean;
}[] = [
  { label: "Hopper (weekly)", game: "hopper", title: "EP 05 — Hopper", description: "Cross the pond for the highest replay-verified score this week — every eligible hunter shares the pool.", target: "Top score", prizeRibbit: 1250, durationDays: 7, autoPay: true },
  { label: "Frogris (weekly)", game: "frogris", title: "EP 02 — Frogris", description: "Clear lines and chase levels for the top verified score this week. Eligible top scores split the pool.", target: "Top score", prizeRibbit: 1000, durationDays: 7, autoPay: true },
  { label: "Worm (weekly)", game: "worm", title: "EP 04 — Worm Frog", description: "Grow the longest and post the best verified score this week. Paid pro-rata to eligible hunters.", target: "Top score", prizeRibbit: 900, durationDays: 7, autoPay: true },
  { label: "Frog Flip (table)", game: "flip", title: "Double or Nothing — Frog Flip", description: "Call the flip and ride your streak. The pool fills as the table is played and pays out the best net.", target: "Best net credits", prizeRibbit: 4000, durationDays: 7, autoPay: true },
  { label: "Pond Dice (table)", game: "dice", title: "High Roller — Pond Dice", description: "Set your line and roll under it. The pool unlocks as dice is played and splits by net winnings.", target: "Best net credits", prizeRibbit: 5000, durationDays: 7, autoPay: true },
  { label: "Blackjack (table)", game: "blackjack", title: "The House Edge — Blackjack", description: "Beat the dealer across the week. The pool fills as blackjack is played and pays out the best net.", target: "Best net credits", prizeRibbit: 6000, durationDays: 7, autoPay: true },
];

function previewShares(prize: number, splits: number[], winners: number): number[] {
  const usable = splits.slice(0, Math.max(1, winners));
  const sum = usable.reduce((a, b) => a + b, 0);
  return usable.map((s) => Math.floor((prize * s) / sum));
}

export default function AdminPage() {
  const { me } = useSession();
  const { payRibbit } = useChain();
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showSig, setShowSig] = useState<Record<string, boolean>>({});
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
    autoPay: true, // auto-settlement is the whole point of the system — default on
  });
  const bountyIsFree = ["hopper", "frogris", "worm"].includes(bountyForm.game);

  const [manage, setManage] = useState<ManagedBounty[]>([]);
  const [editBounty, setEditBounty] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", target: "", prizeRibbit: 0, extendDays: 0, autoPay: false });
  const [editAuction, setEditAuction] = useState<string | null>(null);
  const [auctionEditForm, setAuctionEditForm] = useState({ title: "", description: "", startBidRibbit: 0, minIncrementRibbit: 0, extendHours: 0 });
  const [playerWallet, setPlayerWallet] = useState("");
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [playerErr, setPlayerErr] = useState<string | null>(null);
  const [creditDelta, setCreditDelta] = useState(0);
  const [creditNote, setCreditNote] = useState("");
  const [review, setReview] = useState<Review[]>([]);
  const [paid, setPaid] = useState<PaidBounty[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([]);
  const [sigInputs, setSigInputs] = useState<Record<string, string>>({});
  const [splitChoice, setSplitChoice] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<HouseSettingRow[]>([]);
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [pulse, setPulse] = useState<Pulse | null>(null);

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
    fetch("/api/admin/bounties")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => Array.isArray(rows) && setManage(rows))
      .catch(() => {});
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.settings)) return;
        setSettings(d.settings);
        setSettingDrafts({}); // fresh values win over stale drafts
      })
      .catch(() => {});
    fetch("/api/admin/pulse")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPulse(d))
      .catch(() => {});
  }, []);

  // One-click payout: send $RIBBIT from the admin's connected wallet to the
  // recipient, then mark the queue row sent with the resulting signature.
  const payNow = async (id: string, destination: string, amountRaw: string) => {
    setPayingId(id);
    setMsg(null);
    try {
      const res = await payRibbit(destination, BigInt(amountRaw));
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      const sig = res.data.signature as string;
      const marked = await fetch(`/api/admin/withdrawals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_sent", signature: sig }),
      });
      const d = await marked.json();
      setMsg(marked.ok ? `Paid — sent on-chain (${sig.slice(0, 8)}…).` : (d.error ?? "Paid, but couldn't record it — use the signature field."));
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Payout failed");
    } finally {
      setPayingId(null);
    }
  };

  // Live house parameters (fall back to build-time values until settings load).
  const liveNum = (key: string, fallback: number): number => {
    const row = settings.find((x) => x.key === key);
    return row && typeof row.effective === "number" ? row.effective : fallback;
  };
  // Mirror of the server's requiredCreditSpend: credits that must be wagered
  // on the game before the bounty pays, derived from the prize (no house edge).
  // One open bounty per game — flag if the selected game already has one.
  const openForGame = manage.find(
    (b) => b.game === bountyForm.game && b.status === "open"
  );
  const requiredCredits = Math.max(
    1,
    Math.ceil(
      (bountyForm.prizeRibbit *
        (1 + liveNum("bountyHouseMargin", CLIENT_CONFIG.bountyHouseMargin))) /
        ((1 - liveNum("buyBurnShare", CLIENT_CONFIG.buyBurnShare)) *
          liveNum("ribbitPerCredit", CLIENT_CONFIG.ribbitPerCredit))
    )
  );

  const setSetting = async (row: HouseSettingRow, value: number | boolean | "reset") => {
    const danger = row.danger
      ? `${row.label}: this changes live house behaviour immediately. Continue?`
      : undefined;
    if (danger && !confirm(danger)) return;
    setBusy(true);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        value === "reset" ? { key: row.key, action: "reset" } : { key: row.key, value }
      ),
    });
    const d = await res.json();
    setMsg(
      res.ok
        ? `${row.label} → ${String(d.effective)}${value === "reset" ? " (env default)" : ""}`
        : (d.error ?? "Failed")
    );
    setBusy(false);
    load();
  };

  const lookupPlayer = async (wallet: string) => {
    setPlayerErr(null);
    setPlayer(null);
    const res = await fetch(`/api/admin/users?wallet=${encodeURIComponent(wallet.trim())}`);
    const d = await res.json();
    if (res.ok) setPlayer(d);
    else setPlayerErr(d.error ?? "Lookup failed");
  };
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
  const payout = s?.payout;

  return (
    <div className="pt-10">
      <SectionTitle
        kicker="Operations"
        title="Admin console"
        desc={`Live auctions: ${data?.liveAuctions ?? "…"} · open bounties: ${data?.openBounties ?? "…"}`}
      />
      {/* Action feedback follows you — the console is long, and a notice
          rendered only at the top is invisible from the create forms. */}
      {msg && (
        <div
          className="fixed bottom-4 right-4 z-[90] max-w-md shadow-xl cursor-pointer"
          onClick={() => setMsg(null)}
          title="Dismiss"
        >
          <Notice kind={/fail|error|must|denied|refus|invalid|least|under|between/i.test(msg) ? "err" : "info"}>
            {msg}
          </Notice>
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
        <StatCard
          label="Payout wallet $RIBBIT"
          value={
            payout?.configured && payout.ribbitBalance !== null
              ? payout.ribbitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : payout?.configured
                ? "—"
                : "not set"
          }
          sub={
            payout?.configured && payout.solBalance !== null
              ? `${payout.solBalance.toFixed(3)} SOL for fees`
              : "set PAYOUT_WALLET (public address)"
          }
          tone="gold"
        />
      </div>

      {/* Live pulse — who's active, and who's up on the house */}
      <div className="mb-8">
        <div className="kicker mb-3">Live pulse</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatCard
            label="Active · 24h"
            value={pulse ? pulse.active24.toLocaleString() : "…"}
            sub="played a game"
            tone="neon"
          />
          <StatCard label="Active · 7d" value={pulse ? pulse.active7d.toLocaleString() : "…"} />
          <StatCard
            label="New · 24h"
            value={pulse ? pulse.newUsers24.toLocaleString() : "…"}
            sub={pulse ? `${pulse.newUsers7d.toLocaleString()} in 7d` : undefined}
            tone="portal"
          />
          <StatCard label="Rounds · 24h" value={pulse ? pulse.rounds24.toLocaleString() : "…"} />
          <StatCard
            label="Wagered · 24h"
            value={pulse ? pulse.wagered24.toLocaleString() : "…"}
            sub="credits"
          />
          <StatCard
            label="$RIBBIT in · 24h"
            value={pulse ? pulse.ribbitIn24.toLocaleString() : "…"}
            sub="burned + bought"
            tone="gold"
          />
        </div>
        <div className="panel p-5">
          <h3 className="font-bold mb-1">Most active at the tables · 7d</h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            By credits wagered. A <span className="text-neon">green net</span> means
            they&apos;re up on the house over the window — worth a look.
          </p>
          {pulse && pulse.topPlayers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--text-dim)" }}>
                    <th className="pb-2 text-left font-medium">Player</th>
                    <th className="pb-2 text-right font-medium">Rounds</th>
                    <th className="pb-2 text-right font-medium">Volume</th>
                    <th className="pb-2 text-right font-medium">Net</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {pulse.topPlayers.map((p) => (
                    <tr key={p.wallet} className="table-row">
                      <td className="py-1.5 pr-3 mono text-xs">{shortWallet(p.wallet)}</td>
                      <td className="py-1.5 text-right">{p.rounds.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{p.volume.toLocaleString()}</td>
                      <td
                        className={`py-1.5 text-right stat-number ${
                          p.net > 0 ? "text-neon" : "text-fog"
                        }`}
                      >
                        {p.net > 0 ? "+" : ""}
                        {p.net.toLocaleString()}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          className="btn btn-ghost !text-xs !min-h-[1.8rem]"
                          onClick={() => {
                            setPlayerWallet(p.wallet);
                            lookupPlayer(p.wallet);
                            document
                              .getElementById("player-lookup")
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                        >
                          look up
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-fog">No table play in the last 7 days yet.</p>
          )}
        </div>
      </div>

      {/* House controls — live, admin-tunable parameters */}
      <div className="mb-8">
        <div className="kicker mb-3">House controls</div>
        <div className="panel p-5">
          <p className="text-xs mb-5 leading-relaxed max-w-2xl" style={{ color: "var(--text-dim)" }}>
            These override the deployment defaults <em>live</em> — no redeploy.
            Every change is validated, applied within seconds, and published to
            the treasury ledger with your wallet on it. Reset returns a value
            to its env default.
          </p>
          {settings.length === 0 ? (
            <p className="text-fog text-sm">Loading controls…</p>
          ) : (
            (["Economy", "Limits", "Eligibility", "Switches"] as const).map((group) => (
              <div key={group} className="mb-5 last:mb-0">
                <div className="kicker !text-[0.6rem] mb-2">{group}</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {settings
                    .filter((row) => row.group === group)
                    .map((row) => (
                      <div key={row.key} className="panel p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium tracking-tight text-sm">{row.label}</span>
                          <span className="flex gap-1.5 shrink-0">
                            {row.overridden && (
                              <span className="badge badge-gold" title={`Set by ${row.updatedBy ?? "?"}`}>
                                override
                              </span>
                            )}
                            {row.danger && row.kind === "bool" && row.effective === true && (
                              <span className="badge badge-urgent">active</span>
                            )}
                          </span>
                        </div>
                        <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                          {row.desc}
                        </p>
                        {row.kind === "bool" ? (
                          <div className="flex items-center gap-2">
                            <button
                              className={`btn text-xs ${row.effective ? "btn-ghost !text-danger" : "btn-primary"}`}
                              disabled={busy}
                              onClick={() => setSetting(row, !row.effective)}
                            >
                              {row.effective ? "Switch OFF" : "Switch ON"}
                            </button>
                            <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                              now: {String(row.effective)} · default: {String(row.envDefault)}
                            </span>
                            {row.overridden && (
                              <button
                                className="btn btn-ghost !text-xs !min-h-[1.8rem]"
                                disabled={busy}
                                onClick={() => setSetting(row, "reset")}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              className="input !text-xs mono max-w-[8.5rem]"
                              type="number"
                              step={row.integer ? 1 : 0.01}
                              min={row.min ?? undefined}
                              max={row.max ?? undefined}
                              value={settingDrafts[row.key] ?? String(row.effective)}
                              onChange={(e) =>
                                setSettingDrafts((p) => ({ ...p, [row.key]: e.target.value }))
                              }
                            />
                            <button
                              className="btn btn-primary !text-xs"
                              disabled={
                                busy ||
                                settingDrafts[row.key] === undefined ||
                                settingDrafts[row.key] === String(row.effective) ||
                                settingDrafts[row.key] === ""
                              }
                              onClick={() => setSetting(row, Number(settingDrafts[row.key]))}
                            >
                              Apply
                            </button>
                            {row.overridden && (
                              <button
                                className="btn btn-ghost !text-xs"
                                disabled={busy}
                                onClick={() => setSetting(row, "reset")}
                              >
                                Reset
                              </button>
                            )}
                            <span className="mono text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
                              default {String(row.envDefault)}
                              {row.min !== null && row.max !== null && ` · ${row.min}–${row.max}`}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
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
                  <div className="flex gap-2 items-center flex-wrap">
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy || payingId === w.id || w.status === "processing"}
                      onClick={() => payNow(w.id, w.destination, w.amountRaw)}
                      title="Send from your connected wallet and mark it sent"
                    >
                      {payingId === w.id ? "Approve in wallet…" : "Pay now"}
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy || payingId === w.id}
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
                    <button
                      className="btn btn-ghost !text-xs !min-h-[1.8rem] ml-auto"
                      style={{ color: "var(--text-dim)" }}
                      onClick={() => setShowSig((p) => ({ ...p, [w.id]: !p[w.id] }))}
                    >
                      {showSig[w.id] ? "Hide manual" : "Paid elsewhere?"}
                    </button>
                  </div>
                  {showSig[w.id] && (
                    <div className="flex gap-2 mt-2">
                      <input
                        className="input !text-xs flex-1 mono"
                        placeholder="Paste the tx signature you already sent"
                        value={sigInputs[w.id] ?? ""}
                        onChange={(e) =>
                          setSigInputs((p) => ({ ...p, [w.id]: e.target.value }))
                        }
                      />
                      <button
                        className="btn btn-ghost text-xs"
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-fog mt-4 leading-relaxed">
            <span className="text-frost">Pay now</span> sends the $RIBBIT from your
            connected wallet and records it — approve once in your wallet. Or run{" "}
            <code className="text-neon">node scripts/payout-worker.mjs</code> with the
            payout hot-wallet to clear the whole queue automatically.{" "}
            <span className="opacity-80">“Paid elsewhere?” is for recording a payout you already
            sent by hand.</span>
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
                <input className="input" type="number" value={auctionForm.startBidRibbit || ""}
                  onChange={(e) => setAuctionForm({ ...auctionForm, startBidRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Min step</label>
                <input className="input" type="number" value={auctionForm.minIncrementRibbit || ""}
                  onChange={(e) => setAuctionForm({ ...auctionForm, minIncrementRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Hours</label>
                <input className="input" type="number" value={auctionForm.durationHours || ""}
                  onChange={(e) => setAuctionForm({ ...auctionForm, durationHours: Number(e.target.value) })} />
              </div>
            </div>
            {(() => {
              const problems = [
                auctionForm.title.trim().length < 3 && "title needs at least 3 characters",
                auctionForm.description.trim().length < 10 && "description needs at least 10 characters",
                !(auctionForm.startBidRibbit > 0) && "start bid must be above 0",
                !(auctionForm.minIncrementRibbit > 0) && "min step must be above 0",
                !(auctionForm.durationHours >= 1 && auctionForm.durationHours <= 336) &&
                  "hours must be 1–336",
              ].filter(Boolean) as string[];
              return problems.length > 0 ? (
                <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                  To create: {problems.join(" · ")}
                </p>
              ) : null;
            })()}
            <button
              className="btn btn-portal w-full"
              disabled={
                busy ||
                auctionForm.title.trim().length < 3 ||
                auctionForm.description.trim().length < 10 ||
                !(auctionForm.startBidRibbit > 0) ||
                !(auctionForm.minIncrementRibbit > 0) ||
                !(auctionForm.durationHours >= 1 && auctionForm.durationHours <= 336)
              }
              onClick={() => act("/api/admin/auctions", auctionForm)}
            >
              Create auction
            </button>
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="font-bold mb-4">Create bounty</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-fog">Quick-fill a preset</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {BOUNTY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="btn btn-ghost !text-xs !min-h-[2rem] !px-2.5"
                    onClick={() =>
                      setBountyForm({
                        title: p.title,
                        description: p.description,
                        target: p.target,
                        game: p.game,
                        prizeRibbit: p.prizeRibbit,
                        durationDays: p.durationDays,
                        autoPay: p.autoPay,
                      })
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
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
                <input className="input" type="number" value={bountyForm.prizeRibbit || ""}
                  onChange={(e) => setBountyForm({ ...bountyForm, prizeRibbit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-fog">Days</label>
                <input className="input" type="number" value={bountyForm.durationDays || ""}
                  onChange={(e) => setBountyForm({ ...bountyForm, durationDays: Number(e.target.value) })} />
              </div>
            </div>
            {openForGame && (
              <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                {bountyForm.game} already has an open bounty (“{openForGame.title}”). Only one per
                game — close or cancel it below before creating another.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={bountyForm.autoPay}
                onChange={(e) => setBountyForm({ ...bountyForm, autoPay: e.target.checked })}
              />
              <span className="text-frost">Settle this bounty automatically</span>
            </label>
            {/* Always explain what will happen — manual vs auto, and the
                required credit-spend this bounty needs before it pays. */}
            {(() => {
              const margin = liveNum("bountyHouseMargin", CLIENT_CONFIG.bountyHouseMargin);
              if (!bountyForm.autoPay) {
                return (
                  <div className="panel p-3 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
                    <span className="text-frost font-medium">Manual bounty.</span> It runs as a
                    leaderboard for {bountyForm.durationDays} days; then <em>you</em> pick winners and
                    splits in “Bounty payouts” below and pay them. No automatic payout, no meter.
                  </div>
                );
              }
              if (bountyIsFree) {
                return (
                  <div className="panel p-3 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
                    <span className="text-frost font-medium">Auto-pay · free game.</span> Pays every{" "}
                    {bountyForm.durationDays} days to all eligible winners, split by best score. Free
                    episodes are time-based — no credit-spend meter.
                    <div className="mt-1.5 opacity-80">
                      Requires the global <span className="text-frost">Bounty auto-pay</span> switch (House
                      controls, above) to be ON.
                    </div>
                  </div>
                );
              }
              return (
                <div className="panel p-3 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  <span className="text-frost font-medium">Auto-pay · credit game.</span> Pays all eligible
                  winners pro-rata once{" "}
                  <span className="stat-number text-neon">≈ {requiredCredits.toLocaleString()} credits</span>{" "}
                  have been wagered on {bountyForm.game}. Nothing is paid before that; creating the bounty
                  waits on nothing.
                  <div className="mt-1.5">
                    That threshold comes straight from the prize: those credits were bought with $RIBBIT,
                    so by the time they&apos;re spent the house has already taken in more than the{" "}
                    {bountyForm.prizeRibbit.toLocaleString()} $RIBBIT prize (+ a {Math.round(margin * 100)}%
                    margin) — so the house can&apos;t lose. The house edge doesn&apos;t affect this.
                  </div>
                  <div className="mt-1.5 opacity-80">
                    Requires the global <span className="text-frost">Bounty auto-pay</span> switch to be ON.
                  </div>
                </div>
              );
            })()}
            {(() => {
              // Same rules the server enforces — shown HERE, so the button
              // can never silently refuse.
              const problems = [
                bountyForm.title.trim().length < 3 && "title needs at least 3 characters",
                bountyForm.description.trim().length < 10 && "description needs at least 10 characters",
                !(bountyForm.prizeRibbit > 0) && "prize must be above 0",
                !(bountyForm.durationDays >= 1 && bountyForm.durationDays <= 90) &&
                  "days must be 1–90",
                openForGame && `${bountyForm.game} already has an open bounty`,
              ].filter(Boolean) as string[];
              return (
                <>
                  {problems.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                      To create: {problems.join(" · ")}
                    </p>
                  )}
                  <button
                    className="btn btn-portal w-full"
                    disabled={busy || problems.length > 0}
                    onClick={() => act("/api/admin/bounties", bountyForm)}
                  >
                    Create bounty
                  </button>
                </>
              );
            })()}
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
                      <button
                        className="btn btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => {
                          if (editAuction === a.id) {
                            setEditAuction(null);
                          } else {
                            setEditAuction(a.id);
                            setAuctionEditForm({
                              title: a.title,
                              description: "",
                              startBidRibbit: Number(BigInt(a.startBidRaw) / 10n ** 6n),
                              minIncrementRibbit: 0,
                              extendHours: 0,
                            });
                          }
                        }}
                      >
                        {editAuction === a.id ? "Close editor" : "Edit"}
                      </button>
                      {a._count.bids === 0 && (
                        <button
                          className="btn btn-ghost text-xs !text-danger"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/admin/auctions/${a.id}`,
                              { action: "delete" },
                              "Delete this lot permanently? (No bids — safe to remove.)"
                            )
                          }
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {editAuction === a.id && (
                      <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                        <input className="input !text-xs" placeholder="Title" value={auctionEditForm.title}
                          onChange={(e) => setAuctionEditForm({ ...auctionEditForm, title: e.target.value })} />
                        <textarea className="input !text-xs" placeholder="New description (leave empty to keep)"
                          value={auctionEditForm.description}
                          onChange={(e) => setAuctionEditForm({ ...auctionEditForm, description: e.target.value })} />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[0.65rem] text-fog">
                              Start bid {a._count.bids > 0 && "(locked — has bids)"}
                            </label>
                            <input className="input !text-xs" type="number" disabled={a._count.bids > 0}
                              value={auctionEditForm.startBidRibbit || ""}
                              onChange={(e) => setAuctionEditForm({ ...auctionEditForm, startBidRibbit: Number(e.target.value) })} />
                          </div>
                          <div>
                            <label className="text-[0.65rem] text-fog">
                              Min step {a._count.bids > 0 && "(locked)"}
                            </label>
                            <input className="input !text-xs" type="number" disabled={a._count.bids > 0}
                              placeholder="keep"
                              value={auctionEditForm.minIncrementRibbit || ""}
                              onChange={(e) => setAuctionEditForm({ ...auctionEditForm, minIncrementRibbit: Number(e.target.value) })} />
                          </div>
                          <div>
                            <label className="text-[0.65rem] text-fog">Extend hours</label>
                            <input className="input !text-xs" type="number"
                              value={auctionEditForm.extendHours || ""}
                              onChange={(e) => setAuctionEditForm({ ...auctionEditForm, extendHours: Number(e.target.value) })} />
                          </div>
                        </div>
                        <button
                          className="btn btn-primary text-xs"
                          disabled={busy}
                          onClick={async () => {
                            await act(`/api/admin/auctions/${a.id}`, {
                              action: "edit",
                              title: auctionEditForm.title,
                              ...(auctionEditForm.description.length >= 10
                                ? { description: auctionEditForm.description }
                                : {}),
                              ...(a._count.bids === 0 && auctionEditForm.startBidRibbit > 0
                                ? { startBidRibbit: auctionEditForm.startBidRibbit }
                                : {}),
                              ...(a._count.bids === 0 && auctionEditForm.minIncrementRibbit > 0
                                ? { minIncrementRibbit: auctionEditForm.minIncrementRibbit }
                                : {}),
                              ...(auctionEditForm.extendHours
                                ? { extendHours: auctionEditForm.extendHours }
                                : {}),
                            });
                            setEditAuction(null);
                          }}
                        >
                          Save changes
                        </button>
                      </div>
                    )}
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

      {/* Bounty management — every bounty, editable */}
      <div className="mt-8">
        <div className="kicker mb-3">Bounty management</div>
        {manage.length === 0 ? (
          <p className="text-fog text-sm">No bounties yet.</p>
        ) : (
          <div className="panel p-5 space-y-3">
            {manage.map((b) => (
              <div key={b.id} className="panel p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium tracking-tight">{b.title}</span>
                  {b.game && <span className="badge">{b.game}</span>}
                  <span className="badge badge-gold">
                    {b.prizeRibbit.toLocaleString()} $RIBBIT
                  </span>
                  <span
                    className={`badge ${
                      b.status === "open"
                        ? "badge-live"
                        : b.status === "paid"
                          ? "badge-gold"
                          : ""
                    }`}
                  >
                    {b.status}
                  </span>
                  {b.autoPay && (
                    <span className="badge badge-portal">
                      auto{b.triggerCreditVolume ? ` · ${b.triggerCreditVolume.toLocaleString()} cr` : " · weekly"}
                    </span>
                  )}
                  <span className="text-xs ml-auto" style={{ color: "var(--text-dim)" }}>
                    ends {new Date(b.endsAt).toLocaleDateString()}
                    {b.awards > 0 && ` · ${b.awards} paid`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {b.status !== "paid" && (
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy}
                      onClick={() => {
                        if (editBounty === b.id) {
                          setEditBounty(null);
                        } else {
                          setEditBounty(b.id);
                          setEditForm({
                            title: b.title,
                            target: b.target ?? "",
                            prizeRibbit: b.prizeRibbit,
                            extendDays: 0,
                            autoPay: b.autoPay,
                          });
                        }
                      }}
                    >
                      {editBounty === b.id ? "Close editor" : "Edit"}
                    </button>
                  )}
                  {b.status === "open" && (
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/admin/bounties/${b.id}`,
                          { action: "close" },
                          "Close this bounty early? Auto-pay stops for it permanently — only an explicit award from this console can still pay it."
                        )
                      }
                    >
                      Close early
                    </button>
                  )}
                  {(b.status === "open" || b.status === "closed") && (
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/admin/bounties/${b.id}`,
                          { action: "cancel" },
                          "Cancel this bounty with no payout?"
                        )
                      }
                    >
                      Cancel
                    </button>
                  )}
                  {b.status !== "paid" && b.awards === 0 && (
                    <button
                      className="btn btn-ghost text-xs !text-danger"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/admin/bounties/${b.id}`,
                          { action: "delete" },
                          "Delete this bounty permanently? (Nothing has been paid — safe to remove.)"
                        )
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
                {b.status !== "paid" && (
                  <p className="text-[0.7rem] mt-2" style={{ color: "var(--text-dim)" }}>
                    {b.autoPay
                      ? "Settles automatically when its trigger fills."
                      : "Manual settlement — review eligible winners & pay in “Payout review” below."}
                  </p>
                )}
                {editBounty === b.id && (
                  <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input className="input !text-xs" placeholder="Title" value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                      <input className="input !text-xs" placeholder="Target" value={editForm.target}
                        onChange={(e) => setEditForm({ ...editForm, target: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <label className="text-[0.65rem] text-fog">Prize $RIBBIT</label>
                        <input className="input !text-xs" type="number" value={editForm.prizeRibbit || ""}
                          onChange={(e) => setEditForm({ ...editForm, prizeRibbit: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-[0.65rem] text-fog">Extend days (±)</label>
                        <input className="input !text-xs" type="number" value={editForm.extendDays || ""}
                          onChange={(e) => setEditForm({ ...editForm, extendDays: Number(e.target.value) })} />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-fog cursor-pointer pb-2">
                        <input type="checkbox" checked={editForm.autoPay}
                          onChange={(e) => setEditForm({ ...editForm, autoPay: e.target.checked })} />
                        Auto-pay
                      </label>
                    </div>
                    <p className="text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
                      Changing the prize on an auto-pay credit bounty re-derives its
                      spend trigger automatically (house margin preserved).
                    </p>
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy || editForm.title.length < 3 || editForm.prizeRibbit <= 0}
                      onClick={async () => {
                        await act(`/api/admin/bounties/${b.id}`, {
                          action: "edit",
                          title: editForm.title,
                          target: editForm.target || null,
                          prizeRibbit: editForm.prizeRibbit,
                          autoPay: editForm.autoPay,
                          ...(editForm.extendDays ? { extendDays: editForm.extendDays } : {}),
                        });
                        setEditBounty(null);
                      }}
                    >
                      Save changes
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player management */}
      <div className="mt-8" id="player-lookup">
        <div className="kicker mb-3">Player management</div>
        <div className="panel p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              className="input flex-1 min-w-64 !text-xs mono"
              placeholder="Wallet address"
              value={playerWallet}
              onChange={(e) => setPlayerWallet(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && playerWallet.trim() && lookupPlayer(playerWallet)}
            />
            <button
              className="btn btn-primary text-xs"
              disabled={busy || playerWallet.trim().length < 32}
              onClick={() => lookupPlayer(playerWallet)}
            >
              Look up
            </button>
          </div>
          {playerErr && <Notice kind="err">{playerErr}</Notice>}
          {player && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="mono text-xs break-all">{player.wallet}</span>
                {player.isBanned ? (
                  <span className="badge !text-danger">banned</span>
                ) : (
                  <span className="badge badge-live">active</span>
                )}
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  joined {new Date(player.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="kicker !text-[0.6rem]">Credits</div>
                  <div className="stat-number text-neon">{player.credits.toLocaleString()}</div>
                </div>
                <div>
                  <div className="kicker !text-[0.6rem]">Escrow / locked</div>
                  <div className="stat-number">
                    {fmtRibbit(player.ribbitBalance)} / {fmtRibbit(player.ribbitLocked)}
                  </div>
                </div>
                <div>
                  <div className="kicker !text-[0.6rem]">Burned / bought</div>
                  <div className="stat-number text-gold">
                    {player.burnedRibbit.toLocaleString()} / {player.boughtRibbit.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="kicker !text-[0.6rem]">Activity</div>
                  <div className="text-xs text-fog pt-1">
                    {player.counts.rounds} rounds · {player.counts.scores} runs ·{" "}
                    {player.counts.bids} bids · {player.counts.withdrawals} wd
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
                <button
                  className={`btn text-xs ${player.isBanned ? "btn-primary" : "btn-ghost !text-danger"}`}
                  disabled={busy}
                  onClick={async () => {
                    await act(
                      "/api/admin/users",
                      { wallet: player.wallet, action: player.isBanned ? "unban" : "ban" },
                      player.isBanned
                        ? "Unban this wallet?"
                        : "Ban this wallet? Sign-in and all authenticated actions are blocked immediately."
                    );
                    lookupPlayer(player.wallet);
                  }}
                >
                  {player.isBanned ? "Unban wallet" : "Ban wallet"}
                </button>
                <div>
                  <label className="text-[0.65rem] text-fog">Credits ±</label>
                  <input className="input !text-xs max-w-28" type="number" value={creditDelta || ""}
                    placeholder="±"
                    onChange={(e) => setCreditDelta(Math.trunc(Number(e.target.value)) || 0)} />
                </div>
                <input className="input !text-xs flex-1 min-w-40" placeholder="Reason (goes in the ledger)"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)} />
                <button
                  className="btn btn-portal text-xs"
                  disabled={busy || !creditDelta || creditNote.trim().length < 3}
                  onClick={async () => {
                    await act(
                      "/api/admin/users",
                      { wallet: player.wallet, action: "credits", delta: creditDelta, note: creditNote.trim() },
                      `${creditDelta > 0 ? "Grant" : "Remove"} ${Math.abs(creditDelta)} credits ${creditDelta > 0 ? "to" : "from"} this wallet?`
                    );
                    setCreditDelta(0);
                    setCreditNote("");
                    lookupPlayer(player.wallet);
                  }}
                >
                  Apply credits
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bounty payouts */}
      <div className="mt-8">
        <div className="kicker mb-3">Bounty payouts</div>
        {pool && (
          <div className="panel p-4 text-sm flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4">
            <span>
              <span className="text-fog">Manual-prize budget this week: </span>
              <span className="stat-number text-neon">
                {pool.poolCredits.toLocaleString()} credits
              </span>
            </span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              {Math.round(pool.share * 100)}% of {pool.houseTakeCredits.toLocaleString()}{" "}
              credits realized house take — a guide for MANUAL awards only.
              Auto-pay bounties price their own margin via the spend trigger.
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
