"use client";

// The ONE place the "how much do I need to qualify" answer is phrased, so it
// reads identically on every surface (game strip, standings aside, arcade
// header). Covers all three gates: $OWP deposited during this bounty, $OWP
// deposited lifetime, and — on the tables — $OWP wagered this window.
// Renders nothing once the player clears every gate.
import Link from "next/link";
import { useHouseConfig } from "./use-house-config";

export type QualifyYou = {
  spendEligible: boolean;
  lifetimeEligible: boolean;
  windowEligible: boolean;
  lifetimeSpent: number; // $OWP
  windowSpent: number; // $OWP
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

  // The unmet gate(s), most immediate first: fresh deposits for THIS bounty,
  // lifetime deposits, then table volume. All three are whole $OWP.
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
      label: `Deposit ${n(Math.max(0, house.rankedMinWindowBurnedRibbit - you.windowSpent))} more $OWP during this bounty`,
      have: you.windowSpent,
      need: house.rankedMinWindowBurnedRibbit,
      unit: "$OWP",
    });
  if (!you.lifetimeEligible)
    reqs.push({
      key: "lifetime",
      label: `Deposit ${n(Math.max(0, house.rankedMinBurnedRibbit - you.lifetimeSpent))} more $OWP in total`,
      have: you.lifetimeSpent,
      need: house.rankedMinBurnedRibbit,
      unit: "$OWP",
    });
  if (volumeShort)
    reqs.push({
      key: "volume",
      label: `Wager ${n(Math.max(0, house.rankedMinTableVolume - (you.windowWagered ?? 0)))} more $OWP at this table during this bounty`,
      have: you.windowWagered ?? 0,
      need: house.rankedMinTableVolume,
      unit: "$OWP",
    });
  if (reqs.length === 0) return null;

  if (compact) {
    const r = reqs[0]; // lead with the most immediate gap
    const gap = Math.max(0, r.need - r.have);
    return (
      <span className="text-fog">
        {r.key === "volume"
          ? `wager ${n(gap)} more $OWP to rank`
          : `deposit ${n(gap)} more $OWP to enter`}
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
      {reqs.some((r) => r.key !== "volume") ? (
        <Link href="/games" className="text-neon hover:underline inline-block mt-2.5">
          Deposit $OWP →
        </Link>
      ) : (
        <div className="mt-2.5" style={{ color: "var(--text-dim)" }}>
          Keep playing — every wager counts toward it.
        </div>
      )}
    </div>
  );
}
