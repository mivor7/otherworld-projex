"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";
import { Notice, SectionTitle } from "@/components/ui";
import { CLIENT_CONFIG } from "@/lib/client-config";

const GAMES = [
  {
    href: "/games/flip",
    icon: "🪙",
    name: "Frog Flip",
    desc: "Frog or fly — call the flip. 1.92× on a win.",
    badge: "50% odds",
  },
  {
    href: "/games/dice",
    icon: "🎲",
    name: "Pond Dice",
    desc: "Pick your target, roll under it. Up to 47× payouts.",
    badge: "choose your risk",
  },
  {
    href: "/games/hopper",
    icon: "🐸",
    name: "Hopper",
    desc: "Free arcade action. Cross the traffic, climb the weekly bounty board.",
    badge: "free · bounty",
  },
];

type HistoryRow = {
  id: string;
  game: string;
  wager: number;
  payout: number;
  outcome: Record<string, unknown>;
  createdAt: string;
};

export default function GamesPage() {
  const { me, refresh } = useSession();
  const { burnForCredits } = useChain();
  const [burnAmount, setBurnAmount] = useState(CLIENT_CONFIG.ribbitPerCredit * 10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    if (!me.signedIn) return;
    fetch("/api/games/history")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setHistory(rows))
      .catch(() => {});
  }, [me.signedIn]);

  const doBurn = async () => {
    setBusy(true);
    setMsg(null);
    const res = await burnForCredits(burnAmount);
    if (res.ok) {
      setMsg({
        kind: "ok",
        text: `Burn verified — ${res.data.creditsGranted} credits added.`,
      });
      await refresh();
    } else {
      setMsg({ kind: "err", text: res.error });
    }
    setBusy(false);
  };

  const doFaucet = async () => {
    setBusy(true);
    const res = await fetch("/api/dev/faucet", { method: "POST" });
    setMsg(
      res.ok
        ? { kind: "ok", text: "100 demo credits added (dev faucet)." }
        : { kind: "err", text: "Faucet unavailable" }
    );
    await refresh();
    setBusy(false);
  };

  return (
    <div className="pt-10">
      <SectionTitle
        kicker="The arcade"
        title="Pick your game"
        desc="Casino games run on play credits from burned $RIBBIT — provably fair, published house edge. The Hopper arcade is free and feeds the weekly bounty board."
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="grid sm:grid-cols-2 gap-4 content-start">
          {GAMES.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="panel p-6 hover:border-neon-dim hover:panel-glow transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="text-4xl mb-3">{g.icon}</div>
                <span className="badge">{g.badge}</span>
              </div>
              <h3 className="font-bold text-lg group-hover:text-neon">{g.name}</h3>
              <p className="text-fog text-sm mt-1.5 leading-relaxed">{g.desc}</p>
            </Link>
          ))}

          {me.signedIn && history.length > 0 && (
            <div className="panel p-5 sm:col-span-2">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-fog">
                Your recent rounds
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {history.slice(0, 8).map((h) => (
                      <tr key={h.id} className="table-row">
                        <td className="py-2 pr-3 capitalize">{h.game}</td>
                        <td className="py-2 pr-3 text-fog">−{h.wager}</td>
                        <td
                          className={`py-2 pr-3 stat-number ${h.payout > 0 ? "text-neon" : "text-fog/60"}`}
                        >
                          {h.payout > 0 ? `+${h.payout}` : "0"}
                        </td>
                        <td className="py-2 text-fog/60 text-xs">
                          {new Date(h.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Credits panel */}
        <aside className="panel panel-glow p-6 h-fit sticky top-24">
          <h3 className="font-bold mb-1">Play credits</h3>
          <div className="stat-number text-4xl neon-text mb-4">
            {me.signedIn ? (me.credits ?? 0) : "—"}
          </div>

          {!me.signedIn ? (
            <Notice kind="info">
              Connect your wallet and sign in (top right) to burn $RIBBIT for
              credits and start playing.
            </Notice>
          ) : (
            <>
              <label className="text-xs uppercase tracking-wider text-fog">
                Burn $RIBBIT → credits
              </label>
              <div className="flex gap-2 mt-2 mb-2">
                <input
                  type="number"
                  className="input"
                  min={CLIENT_CONFIG.ribbitPerCredit}
                  step={CLIENT_CONFIG.ribbitPerCredit}
                  value={burnAmount}
                  onChange={(e) => setBurnAmount(Number(e.target.value))}
                />
                <button className="btn btn-primary" onClick={doBurn} disabled={busy}>
                  {busy ? "…" : "Burn"}
                </button>
              </div>
              <p className="text-xs text-fog mb-3">
                {CLIENT_CONFIG.ribbitPerCredit.toLocaleString()} $RIBBIT = 1 credit ·
                you’ll get{" "}
                <span className="text-neon">
                  {Math.floor(burnAmount / CLIENT_CONFIG.ribbitPerCredit)}
                </span>{" "}
                credits. Burns are permanent and verified on-chain.
              </p>
              {CLIENT_CONFIG.devFaucet && (
                <button className="btn btn-ghost w-full mb-3" onClick={doFaucet} disabled={busy}>
                  Dev faucet: +100 credits
                </button>
              )}
            </>
          )}

          {msg && (
            <div className="mt-2">
              <Notice kind={msg.kind}>{msg.text}</Notice>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-edge text-xs text-fog leading-relaxed">
            House edge is a flat {Math.round(0.04 * 100)}% on payouts, split 50%
            treasury / 30% bounty pools / 20% ops.{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              Verify fairness →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
