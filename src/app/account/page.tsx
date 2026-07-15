"use client";

// The hunter's ledger — everything tied to your wallet in one place.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Countdown, Notice, SectionTitle, StatCard } from "@/components/ui";
import { fmtRibbit, shortWallet } from "@/lib/client-config";

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
  const [applications, setApplications] = useState<Application[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me.signedIn) return;
    const grab = <T,>(url: string, set: (v: T[]) => void) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => Array.isArray(rows) && set(rows))
        .catch(() => {});
    grab<MyBid>("/api/me/bids", setBids);
    grab<Withdrawal>("/api/withdrawals", setWithdrawals);
    grab<Application>("/api/listings/apply", setApplications);
    grab<Round>("/api/games/history", setRounds);
    grab<Badge>("/api/me/badges", setBadges);
  }, [me.signedIn]);

  const withdrawAll = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountRaw: BigInt(me.ribbitAvailable ?? "0").toString() }),
    });
    const data = await res.json();
    setMsg(
      res.ok
        ? { kind: "ok", text: "Withdrawal queued — the treasury signer pays out shortly." }
        : { kind: "err", text: data.error ?? "Withdrawal failed" }
    );
    await refresh();
    if (res.ok) {
      const r = await fetch("/api/withdrawals");
      if (r.ok) setWithdrawals(await r.json());
    }
    setBusy(false);
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Play credits" value={String(me.credits ?? 0)} tone="neon" />
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
              Burn for credits
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

      <div className="grid lg:grid-cols-2 gap-4">
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
            <table className="w-full text-sm">
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
            </table>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="kicker">Withdrawals</div>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-fog text-sm">Nothing queued or paid yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {withdrawals.slice(0, 8).map((w) => (
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
            </table>
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
            <table className="w-full text-sm">
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
            </table>
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
            <table className="w-full text-sm">
              <tbody>
                {rounds.slice(0, 8).map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="py-2 pr-2 capitalize">{r.game}</td>
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
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
