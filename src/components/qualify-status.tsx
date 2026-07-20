"use client";

// The ONE place the "how much do I need to qualify" answer is phrased, so it
// reads identically on every surface (game strip, standings aside, arcade
// header). Leads with CREDITS (what you buy) and shows $RIBBIT + live progress,
// because eligibility is enforced on $RIBBIT spent. Renders nothing once the
// player is eligible — it's purely the "what's still missing" helper.
import Link from "next/link";
import { useHouseConfig } from "./use-house-config";

export type QualifyYou = {
  spendEligible: boolean;
  lifetimeEligible: boolean;
  windowEligible: boolean;
  lifetimeSpent: number; // $RIBBIT
  windowSpent: number; // $RIBBIT
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
  if (you.spendEligible) return null;

  const price = house.ribbitPerCredit || 1;
  const toCredits = (ribbit: number) => Math.max(1, Math.ceil(ribbit / price));

  // The unmet gate(s): fresh spend for THIS bounty, and/or lifetime spend.
  const reqs: { key: string; where: string; have: number; need: number }[] = [];
  if (!you.windowEligible)
    reqs.push({
      key: "window",
      where: "during this bounty",
      have: you.windowSpent,
      need: house.rankedMinWindowBurnedRibbit,
    });
  if (!you.lifetimeEligible)
    reqs.push({
      key: "lifetime",
      where: "in total",
      have: you.lifetimeSpent,
      need: house.rankedMinBurnedRibbit,
    });
  if (reqs.length === 0) return null;

  if (compact) {
    const r = reqs[0]; // lead with the most immediate gap (window first)
    const credits = toCredits(Math.max(0, r.need - r.have));
    return (
      <span className="text-fog">
        buy {n(credits)} more credit{credits === 1 ? "" : "s"} to enter
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
          const remaining = Math.max(0, r.need - r.have);
          const credits = toCredits(remaining);
          const pct = r.need > 0 ? Math.min(100, Math.round((r.have / r.need) * 100)) : 100;
          return (
            <div key={r.key}>
              <div
                className="flex justify-between gap-2 mb-1"
                style={{ color: "var(--text-dim)" }}
              >
                <span>
                  Buy {n(credits)} more credit{credits === 1 ? "" : "s"} {r.where}
                </span>
                <span className="mono">
                  {n(r.have)}/{n(r.need)} $RIBBIT
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
      <Link href="/games" className="text-neon hover:underline inline-block mt-2.5">
        Buy credits →
      </Link>
    </div>
  );
}
