"use client";

import { useEffect, useState } from "react";
import { Notice, SectionTitle, StatCard } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";

type TreasuryData = {
  chain: {
    configured: boolean;
    solBalance: number | null;
    ribbitBalance: number | null;
    wallet: string | null;
  };
  ribbitMint: string;
  houseEdge: number;
  houseSplit: { treasury: number; prizePool: number; ops: number };
  totals: {
    ribbitBurnedRaw: string;
    burnCount: number;
    houseTakeCredits: number;
    wageredCredits: number;
    rounds: number;
  };
  recent: {
    id: string;
    kind: string;
    amount: string;
    asset: string;
    note: string | null;
    ref: string | null;
    createdAt: string;
  }[];
};

export default function TreasuryPage() {
  const [data, setData] = useState<TreasuryData | null>(null);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return <div className="pt-20 text-center text-fog">Loading treasury…</div>;

  return (
    <div className="pt-10">
      <SectionTitle
        kicker="Full transparency"
        title="The Treasury 🏦"
        desc="One treasury backs the whole arcade. Balances are read live from Solana; every house-take split and payout is published below."
      />

      {!data.chain.configured && (
        <div className="mb-6">
          <Notice kind="info">
            The on-chain treasury address hasn’t been configured on this
            deployment yet (set TREASURY_WALLET). Off-chain accounting below is
            still live.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Treasury SOL"
          value={data.chain.solBalance !== null ? data.chain.solBalance.toFixed(3) : "—"}
          sub="live balance"
        />
        <StatCard
          label="Treasury $RIBBIT"
          value={
            data.chain.ribbitBalance !== null
              ? data.chain.ribbitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : "—"
          }
          sub="escrow + prize pools"
          tone="portal"
        />
        <StatCard
          label="$RIBBIT burned"
          value={fmtRibbit(data.totals.ribbitBurnedRaw)}
          sub={`${data.totals.burnCount} burns — gone forever`}
          tone="gold"
        />
        <StatCard
          label="House take"
          value={data.totals.houseTakeCredits.toLocaleString()}
          sub={`credits over ${data.totals.rounds.toLocaleString()} rounds`}
          tone="plain"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="panel p-6">
          <h3 className="font-bold mb-4">Where the house take goes</h3>
          {(
            [
              ["Treasury reserve", data.houseSplit.treasury, "bg-neon"],
              ["Bounty prize pools", data.houseSplit.prizePool, "bg-gold"],
              ["Operations", data.houseSplit.ops, "bg-portal"],
            ] as const
          ).map(([label, frac, color]) => (
            <div key={label} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span>{label}</span>
                <span className="stat-number">{Math.round(frac * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-abyss border border-edge overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${frac * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="text-xs text-fog mt-4 leading-relaxed">
            House edge is a flat {Math.round(data.houseEdge * 100)}% on game
            payouts. The take accrues in credits and is swept on-chain by the
            treasury program.
          </p>
        </div>

        <div className="panel p-6">
          <h3 className="font-bold mb-4">Custody</h3>
          <ul className="text-sm text-fog space-y-3 leading-relaxed">
            <li>
              <span className="text-frost font-semibold">Vault:</span> SOL sits in
              a program-derived vault (see <code className="text-neon">program/</code>)
              — payouts require the multisig admin and respect a daily cap.
            </li>
            <li>
              <span className="text-frost font-semibold">Escrow:</span> auction
              deposits go to the treasury token account and are verified
              on-chain before any bidding balance is credited.
            </li>
            <li>
              <span className="text-frost font-semibold">Burns:</span>{" "}
              burn-to-play $RIBBIT is destroyed at the mint — it never touches
              the treasury.
            </li>
          </ul>
          {data.chain.wallet && (
            <a
              className="btn btn-ghost w-full mt-4"
              href={`https://solscan.io/account/${data.chain.wallet}`}
              target="_blank"
              rel="noreferrer"
            >
              Inspect on Solscan ↗
            </a>
          )}
        </div>
      </div>

      <div className="panel p-6">
        <h3 className="font-bold mb-4">Recent treasury events</h3>
        {data.recent.length === 0 ? (
          <p className="text-fog text-sm">No events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {data.recent.map((e) => (
                  <tr key={e.id} className="table-row">
                    <td className="py-2 pr-3">
                      <span className="badge">{e.kind}</span>
                    </td>
                    <td className="py-2 pr-3 stat-number">
                      {e.asset.startsWith("RIBBIT") ? fmtRibbit(e.amount) : e.amount}{" "}
                      <span className="text-fog text-xs">{e.asset}</span>
                    </td>
                    <td className="py-2 pr-3 text-fog">{e.note}</td>
                    <td className="py-2 text-fog/60 text-xs whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
