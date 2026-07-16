"use client";

import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { Notice, StatCard } from "@/components/ui";
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => {
        if (!r.ok) throw new Error("treasury fetch failed");
        return r.json();
      })
      .then(setData)
      .catch(() => setLoadError(true));
  }, []);

  // Always paint the vault banner — never block art behind the API.
  const stats = data
    ? [
        {
          value: data.chain.solBalance !== null ? `${data.chain.solBalance.toFixed(3)} SOL` : "—",
          label: "Vault balance",
        },
        {
          value:
            data.chain.ribbitBalance !== null
              ? data.chain.ribbitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : "—",
          label: "$RIBBIT held",
        },
        { value: fmtRibbit(data.totals.ribbitBurnedRaw), label: "Burned forever" },
      ]
    : [
        { value: "…", label: "Vault balance" },
        { value: "…", label: "$RIBBIT held" },
        { value: "…", label: "Burned forever" },
      ];

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/banner-vault.jpeg"
        imagePosition="center center"
        kicker="Full transparency"
        badge="Live on-chain"
        title="The"
        titleAccent="Treasury"
        subtitle="One vault backs the whole house. Balances read live from Solana; every take split and payout is published below."
        stats={stats}
      />

      {!data && !loadError && (
        <p className="mt-8 text-center text-fog text-sm">Loading vault balances…</p>
      )}
      {loadError && (
        <div className="mt-6">
          <Notice kind="err">Couldn’t load treasury data. Refresh and try again.</Notice>
        </div>
      )}

      {data && (
        <>
          {!data.chain.configured && (
            <div className="mt-6">
              <Notice kind="info">
                The on-chain treasury address hasn’t been configured on this
                deployment yet (set TREASURY_WALLET). Off-chain accounting below is
                still live.
              </Notice>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <StatCard
              label="House net"
              value={`${data.totals.houseTakeCredits >= 0 ? "+" : ""}${data.totals.houseTakeCredits.toLocaleString()}`}
              sub="credits · wagers minus payouts"
              tone={data.totals.houseTakeCredits >= 0 ? "neon" : "plain"}
            />
            <StatCard
              label="Wagered volume"
              value={data.totals.wageredCredits.toLocaleString()}
              sub="credits across all tables"
            />
            <StatCard
              label="Rounds settled"
              value={data.totals.rounds.toLocaleString()}
              sub="provably fair"
              tone="portal"
            />
            <StatCard
              label="Burn events"
              value={String(data.totals.burnCount)}
              sub={`${fmtRibbit(data.totals.ribbitBurnedRaw)} $RIBBIT destroyed`}
              tone="gold"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="panel p-6">
              <div className="kicker mb-5">Allocation of the take</div>
              {(
                [
                  ["Treasury reserve", data.houseSplit.treasury, "var(--color-neon)"],
                  ["Bounty prize pools", data.houseSplit.prizePool, "var(--color-gold)"],
                  ["Operations", data.houseSplit.ops, "var(--color-portal)"],
                ] as const
              ).map(([label, frac, color]) => (
                <div key={label} className="mb-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-fog">{label}</span>
                    <span className="stat-number">{Math.round(frac * 100)}%</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "oklch(0.1 0.006 270)", border: "1px solid var(--hairline)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${frac * 100}%`, background: color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs mt-5 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                House edge is a flat {Math.round(data.houseEdge * 100)}% on game
                payouts. The take accrues in credits and is swept on-chain by the
                treasury program.
              </p>
            </div>

            <div className="panel p-6">
              <div className="kicker mb-5">Custody</div>
              <ul className="text-sm text-fog space-y-3.5 leading-relaxed">
                <li>
                  <span className="text-frost font-medium">Vault.</span> SOL sits in a
                  program-derived vault — payouts require the multisig admin and
                  respect an on-chain daily cap.
                </li>
                <li>
                  <span className="text-frost font-medium">Escrow.</span> Auction
                  deposits go to the treasury token account and are verified
                  on-chain before any bidding balance is credited.
                </li>
                <li>
                  <span className="text-frost font-medium">Burns.</span> Burn-to-play
                  $RIBBIT is destroyed at the mint — it never touches the treasury.
                </li>
              </ul>
              {data.chain.wallet && (
                <a
                  className="btn btn-ghost w-full mt-5"
                  href={`https://solscan.io/account/${data.chain.wallet}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect on Solscan ↗
                </a>
              )}
            </div>
          </div>

          <div className="panel p-6 mt-4">
            <div className="kicker mb-5">Recent treasury events</div>
            {data.recent.length === 0 ? (
              <p className="text-fog text-sm">No events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {data.recent.map((e) => (
                      <tr key={e.id} className="table-row">
                        <td className="py-2.5 pr-3">
                          <span className="badge">{e.kind}</span>
                        </td>
                        <td className="py-2.5 pr-3 stat-number">
                          {e.asset.startsWith("RIBBIT") ? fmtRibbit(e.amount) : e.amount}{" "}
                          <span className="text-fog text-xs font-normal">{e.asset}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-fog">{e.note}</td>
                        <td
                          className="py-2.5 text-xs whitespace-nowrap text-right"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
