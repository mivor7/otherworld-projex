"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useNotifications } from "@/components/use-notifications";
import { CopyChip } from "@/components/copy-chip";
import { useChain } from "@/components/use-chain";
import { Notice, SectionTitle, StatCard } from "@/components/ui";
import { ImageUploadField } from "@/components/image-upload";
import { CLIENT_CONFIG, fmtRibbit, shortWallet } from "@/lib/client-config";

// Relative time for "changed X ago" on overridden settings (module-level so it
// stays outside the component's render-purity analysis).
const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

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
    winnerWallet: string | null;
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

type InviteRow = {
  id: string;
  code: string;
  maxUses: number;
  uses: number;
  note: string | null;
  disabled: boolean;
  createdAt: string;
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
  creditHolders: { wallet: string; credits: number; since: string }[];
  creditsOutstanding: number;
  waitlistCount?: number;
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
  seedRibbit: number;
  status: string;
  autoPay: boolean;
  autoRenew: boolean;
  round: number;
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
  seedRibbit: number;
  durationDays: number;
  autoPay: boolean;
}[] = [
  { label: "Hopper weekly", game: "hopper", title: "The Pond Crossing — Hopper", description: "Cross the pond for the highest replay-verified score of the week. Free to enter — the pool pays every eligible hunter pro-rata at the deadline, then a fresh round opens.", target: "The Highway Bandit", prizeRibbit: 1250, seedRibbit: 0, durationDays: 7, autoPay: true },
  { label: "Frogris weekly", game: "frogris", title: "The Stacking Order — Frogris", description: "Clear lines, chase levels, and post the top verified score of the week. Free to enter — eligible top scores split the pool at the deadline, and a fresh round follows.", target: "The Stack-Smuggler", prizeRibbit: 1000, seedRibbit: 0, durationDays: 7, autoPay: true },
  { label: "Worm weekly", game: "worm", title: "The Long Game — Worm Frog", description: "Grow the longest without biting your tail. Free to enter — the week's best verified scores share the pool at the deadline, then a new round begins.", target: "The Tail-Bite Serpent", prizeRibbit: 900, seedRibbit: 0, durationDays: 7, autoPay: true },
  { label: "Frog Flip pot", game: "flip", title: "Double or Nothing — Frog Flip", description: "Call the coin. The pot opens on a house seed and grows with every flip at the table; the moment it fills, every net-positive hunter splits it — then the next round opens on a fresh pot.", target: "The Two-Face", prizeRibbit: 750, seedRibbit: 250, durationDays: 14, autoPay: true },
  { label: "Pond Dice pot", game: "dice", title: "High Roller — Pond Dice", description: "Set your line and roll under it. The pot opens seeded and grows as dice is played; when it hits the prize it pays all eligible net winners by their net — and re-opens for the next round.", target: "The Deep End", prizeRibbit: 750, seedRibbit: 250, durationDays: 14, autoPay: true },
  { label: "Blackjack pot", game: "blackjack", title: "The House Edge — Blackjack", description: "Beat the dealer, bank the credits. The pot grows with every hand dealt at the table; at the prize it pays every eligible net winner automatically, then a fresh round is dealt in.", target: "The House Toad", prizeRibbit: 1500, seedRibbit: 500, durationDays: 14, autoPay: true },
];

function previewShares(prize: number, splits: number[], winners: number): number[] {
  const usable = splits.slice(0, Math.max(1, winners));
  const sum = usable.reduce((a, b) => a + b, 0);
  return usable.map((s) => Math.floor((prize * s) / sum));
}

export default function AdminPage() {
  const { me } = useSession();
  const { adminItems } = useNotifications();
  const { payRibbit } = useChain();
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const flash = (text: string, tone: "ok" | "err" | "info" = "info") => setMsg({ tone, text });
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showSig, setShowSig] = useState<Record<string, boolean>>({});
  // Rows that were PAID on-chain but whose auto-record failed — "Pay now" must
  // stay locked on them (a second click would double-pay real $RIBBIT).
  const [recordFailed, setRecordFailed] = useState<Record<string, boolean>>({});
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteForm, setInviteForm] = useState({ count: 5, maxUses: 1, note: "" });
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
    seedRibbit: 0,
    durationDays: 7,
    autoPay: true, // auto-settlement is the whole point of the system — default on
    autoRenew: true, // fresh round opens when this one settles — the owner's switch
  });
  const bountyIsFree = ["hopper", "frogris", "worm"].includes(bountyForm.game);

  const [manage, setManage] = useState<ManagedBounty[]>([]);
  const [waitlist, setWaitlist] = useState<{
    count: number;
    goal: number;
    entries: { position: number; displayName: string; email: string; wallet: string | null; joinedAt: string; referrals: number; referredBy: string | null }[];
  } | null>(null);
  const [editBounty, setEditBounty] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", target: "", prizeRibbit: 0, seedRibbit: 0, extendDays: 0, autoPay: false, autoRenew: true });
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
  const [appHours, setAppHours] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("overview"))))
      .then((d) => {
        setData(d);
        setLoadErr(false);
      })
      .catch(() => setLoadErr(true));
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
    fetch("/api/admin/waitlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setWaitlist(d))
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
    fetch("/api/admin/invites")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => Array.isArray(rows) && setInvites(rows))
      .catch(() => {});
  }, []);

  // One-click payout: send $RIBBIT from the admin's connected wallet to the
  // recipient, then mark the queue row sent with the resulting signature.
  const payNow = async (id: string, destination: string, amountRaw: string) => {
    setPayingId(id);
    setMsg(null);
    try {
      // Claim the row BEFORE any money moves — same discipline as the payout
      // worker. If the worker (or another admin tab) already has it, we stop
      // here and nothing was sent.
      const claim = await fetch(`/api/admin/withdrawals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      if (!claim.ok) {
        const d = await claim.json().catch(() => null);
        flash(d?.error ?? "Couldn't claim this payout — it may already be in flight.", "err");
        load();
        return;
      }
      let res;
      try {
        res = await payRibbit(destination, BigInt(amountRaw));
      } catch (e) {
        res = { ok: false as const, error: e instanceof Error ? e.message : "Payout failed" };
      }
      if (!res.ok) {
        if ("maybeSent" in res && res.maybeSent && res.signature) {
          // Broadcast but unconfirmed — the tx may have landed. The row STAYS
          // claimed (processing → Pay now disabled, refresh-proof) and the
          // signature is pre-filled so the operator verifies + marks sent.
          setRecordFailed((p) => ({ ...p, [id]: true }));
          setShowSig((p) => ({ ...p, [id]: true }));
          setSigInputs((p) => ({ ...p, [id]: res.signature! }));
          flash(res.error, "err");
        } else {
          // Nothing hit the chain — hand the row back to the queue/worker.
          await fetch(`/api/admin/withdrawals/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "release" }),
          }).catch(() => {});
          flash(res.error, "err");
        }
        load();
        return;
      }
      const sig = res.data.signature as string;
      let marked: Response;
      try {
        marked = await fetch(`/api/admin/withdrawals/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_sent", signature: sig }),
        });
      } catch {
        // Money moved, record request never reached the server (network drop).
        // Same protocol as record-failure: lock the row, pre-fill the sig.
        setRecordFailed((p) => ({ ...p, [id]: true }));
        setShowSig((p) => ({ ...p, [id]: true }));
        setSigInputs((p) => ({ ...p, [id]: sig }));
        flash(
          "Paid on-chain but the record request didn't reach the server — the signature is pre-filled on that row; click “Mark sent”. Do NOT pay again.",
          "err"
        );
        load();
        return;
      }
      await marked.json().catch(() => {});
      if (marked.ok) {
        flash(`Paid — sent on-chain (${sig.slice(0, 8)}…).`, "ok");
      } else {
        // The money HAS moved but the row is still "pending" — re-arming "Pay
        // now" here risks a double on-chain payment. Lock that row's button,
        // open its manual field pre-filled with the signature, and tell the
        // operator the one click that reconciles it.
        setRecordFailed((p) => ({ ...p, [id]: true }));
        setShowSig((p) => ({ ...p, [id]: true }));
        setSigInputs((p) => ({ ...p, [id]: sig }));
        flash(
          "Sent on-chain but couldn't auto-record. The signature is pre-filled on that row — click “Mark sent” to reconcile. Do NOT pay it again.",
          "err"
        );
      }
      load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Payout failed", "err");
    } finally {
      setPayingId(null);
    }
  };

  // Live house parameters (fall back to build-time values until settings load).
  const liveNum = (key: string, fallback: number): number => {
    const row = settings.find((x) => x.key === key);
    return row && typeof row.effective === "number" ? row.effective : fallback;
  };
  // Mirror of the server's pot math: the pot earns potShare × edge ×
  // (1−burn) × price per credit wagered; the seed covers the head start and
  // play funds prize − seed. One open bounty per game — flag duplicates.
  const openForGame = manage.find(
    (b) => b.game === bountyForm.game && b.status === "open"
  );
  const potRate =
    liveNum("bountyPotShare", CLIENT_CONFIG.bountyPotShare) *
    liveNum("houseEdge", CLIENT_CONFIG.houseEdge) *
    (1 - liveNum("buyBurnShare", CLIENT_CONFIG.buyBurnShare)) *
    liveNum("ribbitPerCredit", CLIENT_CONFIG.ribbitPerCredit);
  const fundedRibbit = Math.max(0, bountyForm.prizeRibbit - bountyForm.seedRibbit);
  const requiredCredits =
    fundedRibbit === 0 ? 1 : Math.max(1, Math.ceil(fundedRibbit / Math.max(potRate, 1e-9)));

  const setSetting = async (row: HouseSettingRow, value: number | boolean | "reset") => {
    // Confirm anything that moves live money/behaviour: the danger switches AND
    // in-range Economy numbers (a fat-fingered price re-prices for everyone).
    const confirmMsg = row.danger
      ? `${row.label}: this changes live house behaviour immediately. Continue?`
      : row.group === "Economy" && typeof value === "number"
        ? `Change ${row.label} from ${row.effective} to ${value}? This applies live for every player.`
        : undefined;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        value === "reset" ? { key: row.key, action: "reset" } : { key: row.key, value }
      ),
    });
    const d = await res.json();
    flash(
      res.ok
        ? `${row.label} → ${String(d.effective)}${value === "reset" ? " (env default)" : ""}`
        : (d.error ?? "Failed"),
      res.ok ? "ok" : "err"
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
    flash(res.ok ? (d.status ? `Done — ${d.status}.` : "Done.") : (d.error ?? "Failed"), res.ok ? "ok" : "err");
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
          className="fixed top-20 left-1/2 -translate-x-1/2 sm:top-auto sm:left-auto sm:translate-x-0 sm:bottom-4 sm:right-4 z-[90] max-w-[92vw] sm:max-w-md shadow-xl cursor-pointer"
          onClick={() => setMsg(null)}
          title="Dismiss"
        >
          <Notice kind={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      {/* What needs action right now — jump straight to the queue. Rendered
          from the SAME feed as the navbar bell (useNotifications), so the bar,
          the bell and the linked sections can never disagree. */}
      {data && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="kicker">Needs action</span>
          {adminItems.length === 0 ? (
            <span className="text-sm text-fog">All clear — nothing waiting.</span>
          ) : (
            adminItems.map((a) => (
              <a key={a.id} href={a.href} className="badge badge-gold" style={{ cursor: "pointer" }}>
                {a.title}
              </a>
            ))
          )}
        </div>
      )}

      {loadErr && (
        <div className="mb-6">
          <Notice kind="err">
            Couldn’t load console data (session expired or a network hiccup). Panels
            may look empty — refresh the page, or reconnect your wallet.
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

          {/* Everyone holding chips right now — outstanding credits are future
              play (and future pot fuel). */}
          {pulse && (
            <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="kicker !text-[0.65rem]">Credit balances</div>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {pulse.creditHolders.length} wallet{pulse.creditHolders.length === 1 ? "" : "s"} ·{" "}
                  {pulse.creditsOutstanding.toLocaleString()} chips outstanding
                  {typeof pulse.waitlistCount === "number" &&
                    ` · airdrop waitlist ${pulse.waitlistCount.toLocaleString()} / 1,000`}
                </span>
              </div>
              {pulse.creditHolders.length === 0 ? (
                <p className="text-sm text-fog">Nobody is holding credits right now.</p>
              ) : (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {pulse.creditHolders.map((h) => (
                        <tr key={h.wallet} className="table-row">
                          <td className="py-1.5 pr-3 mono text-xs">{shortWallet(h.wallet)}</td>
                          <td className="py-1.5 text-right stat-number text-neon">
                            {h.credits.toLocaleString()}
                          </td>
                          <td className="py-1.5 pl-3 text-right text-xs" style={{ color: "var(--text-dim)" }}>
                            joined {new Date(h.since).toLocaleDateString()}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              className="btn btn-ghost !text-xs !min-h-[1.8rem]"
                              onClick={() => {
                                setPlayerWallet(h.wallet);
                                lookupPlayer(h.wallet);
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* Airdrop waitlist — imported snapshot; positions are earned places. */}
      <div className="mb-8">
        <div className="kicker mb-3">Airdrop waitlist</div>
        <div className="panel p-5">
          {!waitlist ? (
            <p className="text-fog text-sm">Loading waitlist…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
                <span className="stat-number text-neon text-xl">
                  {waitlist.count.toLocaleString()} / {waitlist.goal.toLocaleString()}
                </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  members · airdrop guaranteed at {waitlist.goal.toLocaleString()} (amount TBA) ·
                  signup required holding 250k $RIBBIT · positions &amp; referrals are earned —
                  never recompute them
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: "oklch(0.22 0.01 165)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((waitlist.count / waitlist.goal) * 100))}%`,
                    background: "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
                  }}
                />
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: "var(--text-dim)" }}>
                      <th className="pb-2 text-left font-medium">#</th>
                      <th className="pb-2 text-left font-medium">Name</th>
                      <th className="pb-2 text-left font-medium">Email</th>
                      <th className="pb-2 text-left font-medium">Wallet</th>
                      <th className="pb-2 text-right font-medium">Referrals</th>
                      <th className="pb-2 text-right font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.entries.map((w) => (
                      <tr key={w.position} className="table-row">
                        <td className="py-1.5 pr-3 mono text-xs" style={{ color: "var(--text-dim)" }}>
                          {String(w.position).padStart(3, "0")}
                        </td>
                        <td className="py-1.5 pr-3 text-xs">{w.displayName}</td>
                        <td className="py-1.5 pr-3 mono text-xs">{w.email}</td>
                        <td className="py-1.5 pr-3 mono text-xs">
                          {w.wallet ? `${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}` : <span style={{ color: "var(--text-dim)" }}>—</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-xs">{w.referrals || ""}</td>
                        <td className="py-1.5 text-right text-xs" style={{ color: "var(--text-dim)" }}>
                          {new Date(w.joinedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
                          <span className="flex items-center gap-1.5 shrink-0">
                            {row.overridden && row.updatedAt && (
                              <span className="text-[0.6rem]" style={{ color: "var(--text-dim)" }}>
                                {ago(row.updatedAt)}
                              </span>
                            )}
                            {row.overridden && (
                              <span
                                className="badge badge-gold"
                                title={`Set by ${row.updatedBy ?? "?"}${row.updatedAt ? ` — ${new Date(row.updatedAt).toLocaleString()}` : ""}`}
                              >
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
          <h3 className="font-bold mb-4" id="applications" style={{ scrollMarginTop: "6rem" }}>Pending listing applications</h3>
          {!data ? (
            <p className="text-fog text-sm">{loadErr ? "Couldn’t load — retry." : "Loading…"}</p>
          ) : data.applications.length === 0 ? (
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
                  <div className="flex gap-2 items-center flex-wrap">
                    <label className="text-[0.65rem] text-fog">Run for</label>
                    <input
                      type="number"
                      className="input !text-xs max-w-16"
                      min={1}
                      max={336}
                      value={appHours[a.id] ?? 72}
                      onChange={(e) =>
                        setAppHours((p) => ({
                          ...p,
                          [a.id]: Math.max(1, Math.min(336, Math.floor(Number(e.target.value)) || 72)),
                        }))
                      }
                    />
                    <span className="text-[0.65rem] text-fog">h</span>
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy}
                      onClick={() =>
                        act(`/api/admin/applications/${a.id}`, {
                          action: "approve",
                          durationHours: appHours[a.id] ?? 72,
                        })
                      }
                    >
                      Approve → {appHours[a.id] ?? 72}h auction
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
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-bold" id="payouts" style={{ scrollMarginTop: "6rem" }}>Payout queue</h3>
            {data && data.withdrawals.length > 0 && (
              <span className="stat-number text-gold text-sm">
                {fmtRibbit(
                  data.withdrawals.reduce((s, w) => s + BigInt(w.amountRaw), 0n).toString()
                )}{" "}
                RIBBIT owed
              </span>
            )}
          </div>
          {!data ? (
            <p className="text-fog text-sm">{loadErr ? "Couldn’t load — retry." : "Loading…"}</p>
          ) : data.withdrawals.length === 0 ? (
            <p className="text-fog text-sm">Queue is empty.</p>
          ) : (
            <div className="space-y-3">
              {data.withdrawals.map((w) => (
                <div key={w.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm min-w-0">
                      <span className="stat-number text-neon">{fmtRibbit(w.amountRaw)}</span> RIBBIT
                      <span
                        className="block mono text-[0.7rem] break-all mt-0.5"
                        style={{ color: "var(--text-dim)" }}
                        title={w.destination}
                      >
                        → {w.destination}
                      </span>
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
                      disabled={busy || payingId === w.id || w.status === "processing" || recordFailed[w.id]}
                      onClick={() => payNow(w.id, w.destination, w.amountRaw)}
                      title={
                        recordFailed[w.id]
                          ? "Already paid on-chain — use “Mark sent” below to reconcile"
                          : "Send from your connected wallet and mark it sent"
                      }
                    >
                      {payingId === w.id ? "Approve in wallet…" : recordFailed[w.id] ? "Paid — record it ↓" : "Pay now"}
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
                        seedRibbit: p.seedRibbit,
                        durationDays: p.durationDays,
                        autoPay: p.autoPay,
                        autoRenew: true,
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
              {!bountyIsFree && bountyForm.autoPay && (
                <div>
                  <label className="text-xs text-fog" title="House head start on the pot — your declared cost per fill. Play funds the rest.">
                    Seed RIBBIT
                  </label>
                  <input className="input" type="number" min={0} value={bountyForm.seedRibbit || ""}
                    placeholder="0"
                    onChange={(e) => setBountyForm({ ...bountyForm, seedRibbit: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
              )}
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
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={bountyForm.autoRenew}
                onChange={(e) => setBountyForm({ ...bountyForm, autoRenew: e.target.checked })}
              />
              <span className="text-frost">
                Re-open automatically when it settles
                <span className="text-xs text-fog ml-2">
                  (each new round numbers itself — Round 2, 3, …; off = this round is the last)
                </span>
              </span>
            </label>
            {/* Always explain what will happen — manual vs auto, and the
                required credit-spend this bounty needs before it pays. */}
            {(() => {
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
                  <span className="text-frost font-medium">Auto-pay · credit pot.</span> The pot opens at{" "}
                  <span className="stat-number text-gold">{bountyForm.seedRibbit.toLocaleString()} $RIBBIT</span>{" "}
                  (your seed{bountyForm.seedRibbit > 0 ? `, ${Math.round((bountyForm.seedRibbit / Math.max(1, bountyForm.prizeRibbit)) * 100)}% of the prize` : ""}) and
                  grows <span className="stat-number text-neon">{potRate.toFixed(2)} $RIBBIT per credit wagered</span>{" "}
                  — its share of the house edge. It fills at{" "}
                  <span className="stat-number text-neon">≈ {requiredCredits.toLocaleString()} credits</span> wagered on{" "}
                  {bountyForm.game}, then pays all eligible winners pro-rata
                  {bountyForm.autoRenew
                    ? " and re-opens automatically as the next numbered round."
                    : ". Re-open is OFF — this round is the last; the table waits until you post a new bounty."}
                  <div className="mt-1.5">
                    Your cost per fill is <span className="text-frost">the seed and only the seed</span> — the funded{" "}
                    {fundedRibbit.toLocaleString()} $RIBBIT is covered by edge the house genuinely collected, so every
                    fill leaves the house ahead. Whether it fills is up to the players — a pot that never fills costs
                    nothing.
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
            <h3 className="font-bold mb-4" id="deliver" style={{ scrollMarginTop: "6rem" }}>Awaiting delivery</h3>
            {!data ? (
              <p className="text-fog text-sm">{loadErr ? "Couldn’t load — retry." : "Loading…"}</p>
            ) : data.unfulfilled.length === 0 ? (
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
                      won by{" "}
                      {a.winnerWallet ? (
                        <button
                          className="mono text-neon hover:underline"
                          onClick={() => {
                            setPlayerWallet(a.winnerWallet!);
                            lookupPlayer(a.winnerWallet!);
                            document
                              .getElementById("player-lookup")
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                        >
                          {shortWallet(a.winnerWallet)}
                        </button>
                      ) : (
                        "—"
                      )}{" "}
                      · {a.bids} bids · coordinate delivery, then mark it below
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
                  <span
                    className="badge"
                    title={
                      b.autoRenew
                        ? "A fresh round opens automatically when this one settles"
                        : "Final round — will NOT re-open when it settles"
                    }
                  >
                    R{b.round}{b.autoRenew ? " ↻" : " · final"}
                  </span>
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
                            seedRibbit: b.seedRibbit ?? 0,
                            extendDays: 0,
                            autoPay: b.autoPay,
                            autoRenew: b.autoRenew,
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
                        <label className="text-[0.65rem] text-fog">Seed $RIBBIT</label>
                        <input className="input !text-xs" type="number" min={0} value={editForm.seedRibbit || ""}
                          placeholder="0"
                          onChange={(e) => setEditForm({ ...editForm, seedRibbit: Math.max(0, Number(e.target.value) || 0) })} />
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
                      <label className="flex items-center gap-2 text-xs text-fog cursor-pointer pb-2"
                        title="Off = this round is the last; the bounty won't re-open when it settles.">
                        <input type="checkbox" checked={editForm.autoRenew}
                          onChange={(e) => setEditForm({ ...editForm, autoRenew: e.target.checked })} />
                        Re-open on settle
                      </label>
                    </div>
                    <p className="text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
                      Changing the prize on an auto-pay credit bounty re-derives its
                      fill threshold automatically (pot economics preserved).
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
                          seedRibbit: editForm.seedRibbit,
                          autoRenew: editForm.autoRenew,
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

      {/* Invite codes — the invite-only launch gate */}
      <div className="mt-8">
        <div className="kicker mb-3">Invite codes</div>
        <div className="panel p-5">
          <p className="text-xs mb-4 max-w-2xl leading-relaxed" style={{ color: "var(--text-dim)" }}>
            New wallets need a live code to join while <b>Invite-only sign-ups</b> is
            on (House controls · Switches). Existing players are unaffected. A code
            is spent when its uses run out; disable one to kill it instantly.
          </p>
          <div className="flex flex-wrap items-end gap-2 mb-5">
            <div>
              <label className="text-[0.65rem] text-fog">Codes</label>
              <input className="input !text-xs max-w-20" type="number" min={1} max={50}
                value={inviteForm.count || ""}
                onChange={(e) => setInviteForm({ ...inviteForm, count: Math.max(1, Math.min(50, Math.floor(Number(e.target.value)) || 1)) })} />
            </div>
            <div>
              <label className="text-[0.65rem] text-fog">Uses each</label>
              <input className="input !text-xs max-w-20" type="number" min={1} max={1000}
                value={inviteForm.maxUses || ""}
                onChange={(e) => setInviteForm({ ...inviteForm, maxUses: Math.max(1, Math.min(1000, Math.floor(Number(e.target.value)) || 1)) })} />
            </div>
            <input className="input !text-xs flex-1 min-w-40" placeholder="Note (e.g. 'X giveaway wave 1')"
              value={inviteForm.note}
              onChange={(e) => setInviteForm({ ...inviteForm, note: e.target.value })} />
            <button
              className="btn btn-primary text-xs"
              disabled={busy}
              onClick={() =>
                act("/api/admin/invites", {
                  action: "create",
                  count: inviteForm.count,
                  maxUses: inviteForm.maxUses,
                  ...(inviteForm.note.trim() ? { note: inviteForm.note.trim() } : {}),
                })
              }
            >
              Mint {inviteForm.count} code{inviteForm.count === 1 ? "" : "s"}
            </button>
          </div>
          {/* Compact by owner request — the full historical table grew huge.
              Only LIVE codes render (as copyable chips); spent/disabled are a
              counter. Disabling a live code is one click on its ✕. */}
          {invites.length === 0 ? (
            <p className="text-fog text-sm">No codes yet — mint a batch above.</p>
          ) : (() => {
            const live = invites.filter((c) => !c.disabled && c.uses < c.maxUses);
            const spent = invites.filter((c) => !c.disabled && c.uses >= c.maxUses).length;
            const disabled = invites.filter((c) => c.disabled).length;
            return (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>
                  {live.length} live · {spent} spent · {disabled} disabled ·{" "}
                  {invites.reduce((n, c) => n + c.uses, 0)} sign-ups via codes
                </p>
                {live.length === 0 ? (
                  <p className="text-fog text-sm">No live codes — mint a batch above.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {live.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5"
                        style={{ border: "1px solid var(--hairline-strong)", background: "oklch(1 0 0 / 0.03)" }}
                      >
                        <span className="mono text-xs">{c.code}</span>
                        <span className="mono text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
                          {c.uses}/{c.maxUses}
                        </span>
                        <CopyChip text={c.code} label="copy" />
                        <button
                          className="text-fog hover:text-danger text-xs leading-none"
                          title="Disable this code"
                          disabled={busy}
                          onClick={() => act("/api/admin/invites", { action: "disable", id: c.id })}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Bounty payouts */}
      <div className="mt-8">
        <div className="kicker mb-3" id="settle" style={{ scrollMarginTop: "6rem" }}>Bounty payouts</div>
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
                      <span
                        className="badge badge-live"
                        title="Every run was re-simulated server-side from its inputs — scores here are cryptographically trustworthy."
                      >
                        replay-verified
                      </span>
                    ) : (
                      <span
                        className="badge"
                        title="Table results pass heuristic checks, not full replay — eyeball unusually large wins before paying."
                      >
                        heuristic checks
                      </span>
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
