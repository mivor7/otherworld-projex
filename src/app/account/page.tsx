"use client";

// The hunter's ledger — everything tied to your wallet in one place.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Countdown, Notice, SectionTitle, StatCard } from "@/components/ui";
import { fmtRibbit, shortWallet } from "@/lib/client-config";

const GAME_LABELS: Record<string, string> = {
  flip: "Frog Flip",
  dice: "Pond Dice",
  blackjack: "Blackjack",
  hopper: "Hopper",
  frogris: "Frogris",
  worm: "Worm Frog",
};
const gameLabel = (g: string | null | undefined) => (g ? GAME_LABELS[g] ?? g : g);

type MyBid = {
  id: string;
  amountRaw: string;
  status: string;
  auction: { id: string; title: string; status: string; endsAt: string; currentRaw: string };
};
type Withdrawal = {
  id: string;
  amountRaw: string;
  status: string;
  signature: string | null;
  createdAt: string;
  kind?: string;
};
type BountyWin = {
  id: string;
  title: string;
  game: string | null;
  rank: number;
  amountRaw: string;
  status: string;
  signature: string | null;
  createdAt: string;
};
type LiveProgress =
  | { mode: "credit"; spent: number; threshold: number; pct: number; potRibbit?: number; targetRibbit?: number }
  | { mode: "time"; endsAt: string }
  | null;
type LivePosition = {
  id: string;
  title: string;
  game: string;
  prizeRibbit: number;
  value: number;
  rank: number;
  players: number;
  unit: "net chips" | "best score";
  inRunning: boolean;
  projectedRibbit: number;
  spendEligible: boolean;
  lifetimeEligible: boolean;
  windowEligible: boolean;
  progress: LiveProgress;
};
type Application = { id: string; title: string; status: string; askRaw: string };
type Round = {
  id: string;
  game: string;
  wager: number;
  payout: number;
  createdAt: string;
};
type Badge = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  earned: boolean;
};

const BID_BADGE: Record<string, string> = {
  active: "badge-live",
  won: "badge-gold",
  outbid: "",
};

export default function AccountPage() {
  const { me, refresh } = useSession();
  const [bids, setBids] = useState<MyBid[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [bountyWins, setBountyWins] = useState<BountyWin[]>([]);
  const [livePositions, setLivePositions] = useState<LivePosition[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [stake, setStake] = useState<{ stakedRibbit: number; unlockAt: string | null } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me.signedIn) return;
    // On failure return null (not []) so a transient 5xx/401 keeps the data we
    // already show instead of blanking every ledger to its empty state.
    const grab = <T,>(url: string, set: (v: T[]) => void) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((rows) => Array.isArray(rows) && set(rows))
        .catch(() => {});
    grab<MyBid>("/api/me/bids", setBids);
    // withdrawals + bounty wins load in the polling effect below (immediately
    // on mount, then every tick) — fetching them here too was a duplicate.
    grab<Application>("/api/listings/apply", setApplications);
    grab<Round>("/api/games/history", setRounds);
    grab<Badge>("/api/me/badges", setBadges);
    // On-chain stake in the official Streamflow pool (read-only, cosmetic).
    fetch("/api/staking")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.you && setStake(d.you))
      .catch(() => {});
  }, [me.signedIn]);

  // Watch live bounty positions in real time — a player who has stopped
  // playing still has a share riding on the pool, and can see it move here.
  useEffect(() => {
    if (!me.signedIn) return;
    // On failure return null (not []) — never blank real data on a bad poll.
    const grab = <T,>(url: string, set: (v: T[]) => void) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((rows) => Array.isArray(rows) && set(rows))
        .catch(() => {});
    const load = () => {
      grab<LivePosition>("/api/me/bounties/live", setLivePositions);
      // Poll the status-changing data too, so a prize going pending→paid or a
      // new win landing shows up here without a manual refresh.
      grab<Withdrawal>("/api/withdrawals", setWithdrawals);
      grab<BountyWin>("/api/me/bounties", setBountyWins);
    };
    load();
    refresh(); // balances — on mount/focus/withdraw, NOT per tick: a per-tick
    // refresh re-sets the session context and re-renders the whole app.
    const t = setInterval(load, 30_000);
    const onFocus = () => {
      load();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [me.signedIn, refresh]);

  const withdrawAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRaw: BigInt(me.ribbitAvailable ?? "0").toString() }),
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? { kind: "ok", text: "Withdrawal queued — the payout worker sends it shortly." }
          : { kind: "err", text: data.error ?? "Withdrawal failed" }
      );
      await refresh();
      if (res.ok) {
        const r = await fetch("/api/withdrawals");
        if (r.ok) setWithdrawals(await r.json());
      }
    } catch {
      setMsg({ kind: "err", text: "Network error — check your balance and try again." });
    } finally {
      setBusy(false);
    }
  };

  if (!me.signedIn) {
    return (
      <div className="pt-24 max-w-md mx-auto">
        <Notice kind="info">
          Connect your wallet and sign in (top right) to see your account.
        </Notice>
      </div>
    );
  }

  const leading = bids.filter((b) => b.status === "active").length;

  return (
    <div className="pt-10">
      <SectionTitle
        kicker={`Hunter · ${shortWallet(me.wallet ?? "")}`}
        title="My account"
        desc="Your balances, bids, consignments and rounds — the house keeps the books, you keep the receipts."
      />

      {stake && stake.stakedRibbit > 0 && (
        <div className="-mt-3 mb-5 text-xs text-fog">
          <span className="staker-mark mr-1.5">staker</span>
          {Math.round(stake.stakedRibbit).toLocaleString()} $RIBBIT staked
          {stake.unlockAt && (
            <> · unlocks {new Date(stake.unlockAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
          )}{" "}
          · <Link href="/staking" className="text-neon hover:underline">Staking →</Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Table chips ⛁" value={String(me.credits ?? 0)} tone="neon" />
        <StatCard
          label="$RIBBIT available"
          value={fmtRibbit(me.ribbitAvailable ?? 0)}
          sub="in the bidding account"
        />
        <StatCard
          label="Locked in bids"
          value={fmtRibbit(me.ribbitLocked ?? 0)}
          sub={`leading ${leading} ${leading === 1 ? "lot" : "lots"}`}
          tone="portal"
        />
        <div className="panel p-4 flex flex-col justify-between gap-2">
          <div className="kicker">Move funds</div>
          <div className="grid gap-1.5">
            <Link href="/games" className="btn btn-ghost !text-xs w-full">
              Buy chips
            </Link>
            <button
              className="btn btn-ghost !text-xs w-full"
              onClick={withdrawAll}
              disabled={busy || BigInt(me.ribbitAvailable ?? "0") === 0n}
            >
              Withdraw available
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className="mb-6">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}

      {badges.length > 0 && (
        <div className="panel p-5 mb-4">
          <div className="kicker mb-4">
            Badges · {badges.filter((b) => b.earned).length}/{badges.length} earned
          </div>
          <div className="flex flex-wrap gap-2.5">
            {badges.map((b) => (
              <div
                key={b.id}
                title={b.desc}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                style={
                  b.earned
                    ? { borderColor: "oklch(0.78 0.11 150 / 0.4)", background: "oklch(0.78 0.11 150 / 0.06)" }
                    : { borderColor: "var(--hairline)", opacity: 0.45 }
                }
              >
                <span>{b.icon}</span>
                <span className="font-medium tracking-tight">{b.name}</span>
                {!b.earned && (
                  <span className="text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
                    {b.desc}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {livePositions.length > 0 && (
        <div className="panel p-5 mb-4">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker flex items-center gap-1.5">
              <span className="live-dot" /> Your live bounty standings
            </div>
            <Link href="/bounties" className="text-xs text-neon hover:underline">
              All bounties →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {livePositions.map((p) => {
              const isScore = p.unit === "best score";
              const valLine = isScore
                ? `best ${p.value.toLocaleString()}`
                : `net ${p.value > 0 ? "+" : ""}${p.value.toLocaleString()}`;
              const winning = p.inRunning && p.projectedRibbit > 0;
              return (
                <div
                  key={p.id}
                  className="rounded-lg p-3"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-medium tracking-tight text-sm">
                      <span>{gameLabel(p.game)}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-dim)" }}>
                        {p.title}
                      </span>
                    </div>
                    <span className="stat-number text-gold text-xs whitespace-nowrap">
                      {p.prizeRibbit.toLocaleString()} $RIBBIT
                    </span>
                  </div>

                  {p.progress?.mode === "credit" && (
                    <div className="mb-2">
                      <div
                        className="flex justify-between text-[0.6rem] mb-1"
                        style={{ color: "var(--text-dim)" }}
                      >
                        <span>pool fills as it&apos;s played</span>
                        <span className="mono">{p.progress.pct}%</span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "oklch(0.22 0.01 165)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${p.progress.pct}%`,
                            background:
                              "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Position first — the honest standing, win or lose. A
                      projected payout is shown ONLY when they're actually in
                      line to be paid, never as a blanket "reward waiting". */}
                  <div className="text-xs leading-snug">
                    <span className="mono" style={{ color: "var(--text-dim)" }}>
                      #{p.rank} of {p.players}
                    </span>
                    <span style={{ color: "var(--text-dim)" }}> · {valLine} · </span>
                    {winning ? (
                      <span className="text-neon">
                        would take ~{Math.round(p.projectedRibbit).toLocaleString()} $RIBBIT
                        if it pays now
                      </span>
                    ) : !p.spendEligible ? (
                      <span className="text-fog">
                        not eligible —{" "}
                        {!p.lifetimeEligible
                          ? "spend more $RIBBIT on chips"
                          : "buy chips during this bounty"}
                      </span>
                    ) : p.value > 0 ? (
                      <span className="text-fog">in the running as the pool fills</span>
                    ) : (
                      <span className="text-fog">
                        {isScore ? "post a score to enter" : "not winning yet — go net-positive"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {livePositions.some((p) => p.inRunning && p.projectedRibbit > 0) && (
            <p className="text-[0.7rem] mt-3" style={{ color: "var(--text-dim)" }}>
              Projected shares shift as others play and lock when each pool fills —
              a share you&apos;re in line for stays yours even if you stop playing.
            </p>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">Bounty winnings</div>
            <Link href="/bounties" className="text-xs text-gold hover:underline">
              All bounties →
            </Link>
          </div>
          {bountyWins.length === 0 ? (
            <p className="text-fog text-sm">
              No bounty prizes yet — qualify and win to see them here.
            </p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {bountyWins.slice(0, 8).map((w) => (
                  <tr key={w.id} className="table-row">
                    <td className="py-2 pr-2">
                      {w.game && <span>{gameLabel(w.game)}</span>}
                      <span className="text-xs ml-2" style={{ color: "var(--text-dim)" }}>
                        {w.title}
                      </span>
                    </td>
                    <td className="py-2 pr-2 stat-number text-gold text-right whitespace-nowrap">
                      {fmtRibbit(w.amountRaw)}
                    </td>
                    <td className="py-2 text-right">
                      {w.signature ? (
                        <a
                          className="badge badge-live"
                          href={`https://solscan.io/tx/${w.signature}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          paid ↗
                        </a>
                      ) : (
                        <span className={`badge ${w.status === "rejected" ? "" : "badge-gold"}`}>
                          {w.status === "processing"
                            ? "paying out"
                            : w.status === "rejected"
                            ? "on hold"
                            : "pending"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">My bids</div>
            <Link href="/auctions" className="text-xs text-neon hover:underline">
              Auction house →
            </Link>
          </div>
          {bids.length === 0 ? (
            <p className="text-fog text-sm">No bids yet — the lots await.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {bids.slice(0, 8).map((b) => (
                  <tr key={b.id} className="table-row">
                    <td className="py-2 pr-2">
                      <Link href={`/auctions/${b.auction.id}`} className="hover:text-neon transition-colors">
                        {b.auction.title}
                      </Link>
                      {b.auction.status === "live" && (
                        <span className="text-xs ml-2" style={{ color: "var(--text-dim)" }}>
                          <Countdown to={b.auction.endsAt} />
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 stat-number text-right whitespace-nowrap">
                      {fmtRibbit(b.amountRaw)}
                    </td>
                    <td className="py-2 text-right">
                      <span className={`badge ${BID_BADGE[b.status] ?? ""}`}>
                        {b.status === "active" ? "leading" : b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">Balance withdrawals</div>
          </div>
          {withdrawals.filter((w) => w.kind !== "bounty").length === 0 ? (
            <p className="text-fog text-sm">Nothing queued or paid yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {withdrawals.filter((w) => w.kind !== "bounty").slice(0, 8).map((w) => (
                  <tr key={w.id} className="table-row">
                    <td className="py-2 pr-2 stat-number">{fmtRibbit(w.amountRaw)}</td>
                    <td className="py-2 pr-2 text-xs" style={{ color: "var(--text-dim)" }}>
                      {new Date(w.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {w.signature ? (
                        <a
                          className="badge badge-live"
                          href={`https://solscan.io/tx/${w.signature}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          sent ↗
                        </a>
                      ) : (
                        <span className={`badge ${w.status === "rejected" ? "" : "badge-gold"}`}>
                          {w.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">My consignments</div>
            <Link href="/auctions/apply" className="text-xs text-portal hover:underline">
              Consign a lot →
            </Link>
          </div>
          {applications.length === 0 ? (
            <p className="text-fog text-sm">You haven’t consigned anything yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {applications.slice(0, 8).map((a) => (
                  <tr key={a.id} className="table-row">
                    <td className="py-2 pr-2">{a.title}</td>
                    <td className="py-2 pr-2 stat-number text-right">{fmtRibbit(a.askRaw)}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`badge ${
                          a.status === "approved" ? "badge-live" : a.status === "pending" ? "badge-gold" : ""
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">Recent rounds</div>
            <Link href="/fairness" className="text-xs text-neon hover:underline">
              Verify fairness →
            </Link>
          </div>
          {rounds.length === 0 ? (
            <p className="text-fog text-sm">No rounds played yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {rounds.slice(0, 8).map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="py-2 pr-2">{gameLabel(r.game)}</td>
                    <td className="py-2 pr-2 mono text-xs text-fog">−{r.wager}</td>
                    <td
                      className={`py-2 pr-2 mono text-xs ${r.payout > 0 ? "text-neon" : ""}`}
                      style={r.payout === 0 ? { color: "var(--text-dim)" } : undefined}
                    >
                      {r.payout > 0 ? `+${r.payout}` : "0"}
                    </td>
                    <td className="py-2 text-xs text-right" style={{ color: "var(--text-dim)" }}>
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
