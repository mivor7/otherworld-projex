"use client";

// Shown in a game panel for a few minutes AFTER a bounty settles, so a player
// who was racing sees the OUTCOME instead of the live strip just vanishing
// ("wait — what happened, did I win?"). Celebrates a win (with confetti) and
// otherwise states plainly that it paid out and a fresh pool is building.
// Dismissible, and remembered per-settlement so it doesn't nag on every poll.
import { useEffect, useRef, useState } from "react";
import { celebrate } from "./confetti";

export type JustEnded = {
  id: string;
  title: string;
  prizeRibbit: number;
  winners: number;
  you: { won: boolean; rank: number | null; amountRibbit: number } | null;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const KEY = (id: string) => `owp:bountyEnded:${id}`;

export function BountyEndedCard({ data }: { data: JustEnded }) {
  const won = !!data.you?.won;
  const [dismissed, setDismissed] = useState(false);
  const celebrated = useRef(false);

  // One-time per settled bounty per session — survives the strip's 8s re-polls.
  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(KEY(data.id));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seen) setDismissed(true);
  }, [data.id]);

  useEffect(() => {
    if (won && !celebrated.current && !dismissed) {
      celebrated.current = true;
      celebrate();
    }
  }, [won, dismissed]);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(KEY(data.id), "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className="rounded-xl px-4 py-3 mb-3 relative"
      style={{
        background: won ? "oklch(0.78 0.11 150 / 0.08)" : "oklch(0.7 0.04 260 / 0.06)",
        border: won
          ? "1px solid oklch(0.78 0.11 150 / 0.4)"
          : "1px solid var(--hairline-strong)",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-1.5 right-2 text-fog hover:text-frost text-xs leading-none p-1"
      >
        ✕
      </button>
      <div className="flex items-center gap-2 mb-1 pr-7">
        <span className="text-base leading-none">🏁</span>
        <span className="text-sm font-semibold">The {data.title} bounty just ended</span>
      </div>
      {won ? (
        <p className="text-sm text-neon">
          You placed #{data.you!.rank} —{" "}
          <span className="stat-number text-gold">{fmt(data.you!.amountRibbit)} $RIBBIT</span>{" "}
          is on its way to your wallet. 🎉
        </p>
      ) : (
        <p className="text-xs text-fog">
          {data.winners > 0 ? (
            <>
              {data.winners} hunter{data.winners === 1 ? "" : "s"} shared{" "}
              {fmt(data.prizeRibbit)} $RIBBIT.{" "}
            </>
          ) : (
            <>No one qualified this round. </>
          )}
          A fresh pool builds as the game is played — keep hunting.
        </p>
      )}
    </div>
  );
}
