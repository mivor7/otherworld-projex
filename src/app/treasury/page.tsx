"use client";

import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { Notice, StatCard } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";
import { RowSkeleton } from "@/components/skeletons";

type TreasuryData = {
  chain: {
    configured: boolean;
    solBalance: number | null;
    ribbitBalance: number | null;
    wallet: string | null;
  };
  ribbitMint: string;
  houseEdge: number;
  economy: { buyBurnShare: number; bountyPotShare: number; ribbitPerCredit: number };
  totals: {
    ribbitBurnedRaw: string;
    burnCount: number;
    creditsSoldRaw: string;
    purchaseCount: number;
    depositedRaw: string;
    depositCount: number;
    bountyPaidRaw: string;
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
          label: "$OWP held",
        },
        { value: fmtRibbit(data.totals.depositedRaw), label: "$OWP deposited" },
      ]
    : [
        { value: "…", label: "Vault balance" },
        { value: "…", label: "$OWP held" },
        { value: "…", label: "$OWP deposited" },
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
        subtitle="One wallet backs the house. Deposits land here and become app balances. Withdrawals and bounty prizes leave from the same wallet, automatically. Balances read live from Solana."
        stats={stats}
      />

      {!data && !loadError && (
        <div className="mt-8 space-y-2" aria-label="Loading vault data">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
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
              label="Prizes paid"
              value={fmtRibbit(data.totals.bountyPaidRaw)}
              sub="$OWP in bounty prizes sent to hunters"
              tone="neon"
            />
            <StatCard
              label="Wagered volume"
              value={data.totals.wageredCredits.toLocaleString()}
              sub={`$OWP across the tables · edge kept ${data.totals.houseTakeCredits.toLocaleString()} $OWP`}
            />
            <StatCard
              label="Rounds settled"
              value={data.totals.rounds.toLocaleString()}
              sub="provably fair"
              tone="portal"
            />
            <StatCard
              label="Deposits"
              value={data.totals.depositCount.toLocaleString()}
              sub={`${fmtRibbit(data.totals.depositedRaw)} $OWP sent to the house wallet`}
              tone="gold"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="panel p-6">
              <div className="kicker mb-5">How the prizes are funded</div>
              {(
                [
                  [
                    "Deposits",
                    "players send $OWP to the house wallet; that balance is what they wager, bid, and withdraw",
                    "var(--color-neon)",
                    1,
                  ],
                  [
                    "Table house edge",
                    `flat ${Math.round(data.houseEdge * 100)}% kept on table payouts — the only cost of play`,
                    "var(--color-portal)",
                    data.houseEdge * 5,
                  ],
                  [
                    "Every bounty pot",
                    `is funded by ${Math.round(data.economy.bountyPotShare * 100)}% of the edge the house actually collects — pots only pay what play has earned them (plus any declared house seed)`,
                    "var(--color-gold)",
                    data.economy.bountyPotShare,
                  ],
                ] as const
              ).map(([label, detail, color, frac]) => (
                <div key={label} className="mb-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 text-sm mb-1.5">
                    <span className="text-frost font-medium">{label}</span>
                    <span className="text-fog sm:text-right text-[0.8rem]">{detail}</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "oklch(0.1 0.006 270)", border: "1px solid var(--hairline)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(1, frac) * 100}%`, background: color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs mt-5 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                Bounty prizes are fixed up front and paid from the treasury —{" "}
                {fmtRibbit(data.totals.bountyPaidRaw)} $OWP paid to hunters so
                far. Triggers are derived from each prize, so a pool that pays
                out has already earned the house more than it costs.
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
                  <span className="text-frost font-medium">$OWP.</span> Deposits are
                  verified on-chain, then credited as app balance. The same
                  wallet pays withdrawals and bounty prizes automatically.
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
                          {e.asset === "SOL"
                            ? (Number(e.amount) / 1e9).toLocaleString(undefined, {
                                maximumFractionDigits: 4,
                              })
                            : e.asset.startsWith("RIBBIT") || e.asset.startsWith("OWP")
                              ? fmtRibbit(e.amount)
                              : e.amount}{" "}
                          <span className="text-fog text-xs font-normal">
                            {e.asset === "SOL"
                              ? "SOL"
                              : e.asset.startsWith("RIBBIT") || e.asset.startsWith("OWP")
                                ? e.asset.includes("BURN")
                                  ? "$OWP burned"
                                  : "$OWP"
                                : e.asset}
                          </span>
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
