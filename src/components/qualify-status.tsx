"use client";

// The ONE place the "how much do I need to qualify" answer is phrased, so it
// reads identically on every surface (game strip, standings aside, arcade
// header). Covers all three gates: fresh spend for this bounty, lifetime
// spend (both bought in $RIBBIT), and — on the tables — wagered volume this
// window. Renders nothing once the player clears every gate — it's purely
// the "what's still missing" helper.
import Link from "next/link";
import { useHouseConfig } from "./use-house-config";

export type QualifyYou = {
  spendEligible: boolean;
  lifetimeEligible: boolean;
  windowEligible: boolean;
  lifetimeSpent: number; // $RIBBIT
  windowSpent: number; // $RIBBIT
  // Tables only (absent/true on arcade and older payloads): credits wagered
  // on this table this window vs the house's volume-to-rank floor.
  volumeEligible?: boolean;
  windowWagered?: number;
};

const n = (x: number) => Math.max(0, Math.round(x)).toLocaleString();

export function QualifyStatus({
  you,
  compact = false,
}: {
  you: QualifyYou;
  compact?: boolean;
}) {
  const house = useHouseConfig();
  const volumeShort = you.volumeEligible === false;
  if (you.spendEligible && !volumeShort) return null;

  const price = house.ribbitPerCredit || 1;
  const toCredits = (ribbit: number) => Math.max(1, Math.ceil(ribbit / price));

  // The unmet gate(s), most immediate first: fresh spend for THIS bounty,
  // lifetime spend, then table volume. Spend is phrased in credits-to-BUY
  // ($RIBBIT under the hood); volume is credits-to-WAGER at this table.
  const reqs: {
    key: string;
    label: string;
    have: number;
    need: number;
    unit: string;
  }[] = [];
  if (!you.windowEligible)
    reqs.push({
      key: "window",
      label: `Buy ${n(toCredits(Math.max(0, house.rankedMinWindowBurnedRibbit - you.windowSpent)))} more chips during this bounty`,
      have: you.windowSpent,
      need: house.rankedMinWindowBurnedRibbit,
      unit: "$RIBBIT",
    });
  if (!you.lifetimeEligible)
    reqs.push({
      key: "lifetime",
      label: `Buy ${n(toCredits(Math.max(0, house.rankedMinBurnedRibbit - you.lifetimeSpent)))} more chips in total`,
      have: you.lifetimeSpent,
      need: house.rankedMinBurnedRibbit,
      unit: "$RIBBIT",
    });
  if (volumeShort)
    reqs.push({
      key: "volume",
      label: `Wager ${n(Math.max(0, house.rankedMinTableVolume - (you.windowWagered ?? 0)))} more chips at this table during this bounty`,
      have: you.windowWagered ?? 0,
      need: house.rankedMinTableVolume,
      unit: "chips",
    });
  if (reqs.length === 0) return null;

  if (compact) {
    const r = reqs[0]; // lead with the most immediate gap
    const gap = Math.max(0, r.need - r.have);
    return (
      <span className="text-fog">
        {r.key === "volume"
          ? `wager ${n(gap)} more chip${gap === 1 ? "" : "s"} to rank`
          : `buy ${n(toCredits(gap))} more chip${toCredits(gap) === 1 ? "" : "s"} to enter`}
      </span>
    );
  }

  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{
        background: "oklch(0.75 0.14 70 / 0.08)",
        border: "1px solid oklch(0.75 0.14 70 / 0.3)",
      }}
    >
      <div className="font-medium mb-2" style={{ color: "oklch(0.85 0.13 80)" }}>
        To win this bounty, qualify first
      </div>
      <div className="space-y-2.5">
        {reqs.map((r) => {
          const pct = r.need > 0 ? Math.min(100, Math.round((r.have / r.need) * 100)) : 100;
          return (
            <div key={r.key}>
              <div
                className="flex justify-between gap-2 mb-1"
                style={{ color: "var(--text-dim)" }}
              >
                <span>{r.label}</span>
                <span className="mono">
                  {n(r.have)}/{n(r.need)} {r.unit}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "oklch(0.22 0.01 165)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, oklch(0.78 0.12 70), oklch(0.85 0.13 85))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {reqs.some((r) => r.unit === "$RIBBIT") ? (
        <Link href="/games" className="text-neon hover:underline inline-block mt-2.5">
          Buy chips →
        </Link>
      ) : (
        <div className="mt-2.5" style={{ color: "var(--text-dim)" }}>
          Keep playing — every wager counts toward it.
        </div>
      )}
    </div>
  );
}
