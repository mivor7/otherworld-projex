"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";

type DiceResult = {
  outcome: { rolled: number; target: number; multiplier: number };
  payout: number;
  win: boolean;
  credits: number;
  nonce: number;
  seedHash: string;
};

export default function DicePage() {
  const { me, refresh } = useSession();
  const [target, setTarget] = useState(50);
  const [wager, setWager] = useState(5);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<DiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const multiplier = (100 / target) * 0.96;

  const play = async () => {
    const clientSeed = Math.random().toString(36).slice(2, 12);
    setRolling(true);
    setError(null);
    const res = await fetch("/api/games/dice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, wager, clientSeed }),
    });
    const data = await res.json();
    await new Promise((r) => setTimeout(r, 600));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
    } else {
      setResult(data);
      await refresh();
    }
    setRolling(false);
  };

  return (
    <div className="pt-10 max-w-2xl mx-auto">
      <SectionTitle
        kicker="Pond Dice"
        title="Roll under the line 🎲"
        desc="Slide to set your risk. Lower target, bigger multiplier — roll under it and win."
      />

      <div className="panel panel-glow p-8">
        {/* Result track */}
        <div className="relative h-10 rounded-lg bg-abyss border border-edge mb-2 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-neon/15 border-r-2 border-neon"
            style={{ width: `${target}%` }}
          />
          {result && (
            <div
              className={`absolute top-0 bottom-0 w-1 ${result.win ? "bg-neon" : "bg-danger"}`}
              style={{ left: `${result.outcome.rolled}%` }}
              title={`rolled ${result.outcome.rolled}`}
            />
          )}
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neon">
            win zone &lt; {target}
          </span>
        </div>
        <input
          type="range"
          min={2}
          max={98}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="w-full accent-[#36f581] mb-6"
        />

        <div className="grid grid-cols-3 gap-3 text-center mb-6">
          <div className="panel p-3">
            <div className="text-xs text-fog uppercase tracking-wider mb-1">Win chance</div>
            <div className="stat-number text-neon text-lg">{target}%</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-fog uppercase tracking-wider mb-1">Multiplier</div>
            <div className="stat-number text-portal text-lg">{multiplier.toFixed(2)}×</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-fog uppercase tracking-wider mb-1">To win</div>
            <div className="stat-number text-gold text-lg">{Math.floor(wager * multiplier)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6 justify-center">
          <label className="text-sm text-fog">Wager</label>
          <input
            type="number"
            className="input max-w-28 text-center"
            min={1}
            max={1000}
            value={wager}
            onChange={(e) => setWager(Math.max(1, Math.floor(Number(e.target.value))))}
          />
          <span className="text-sm text-fog">credits</span>
        </div>

        {result && !rolling && (
          <div
            className={`stat-number text-center text-2xl mb-4 ${result.win ? "neon-text" : "text-danger"}`}
          >
            rolled {result.outcome.rolled.toFixed(2)} —{" "}
            {result.win ? `+${result.payout} credits!` : "under the water it goes."}
          </div>
        )}

        <div className="text-center">
          <button
            className="btn btn-primary text-lg px-12 py-3"
            onClick={play}
            disabled={rolling || !me.signedIn || (me.credits ?? 0) < wager}
          >
            {rolling ? "Rolling…" : "Roll"}
          </button>
        </div>

        {!me.signedIn && (
          <p className="text-fog text-sm mt-4 text-center">
            Sign in with your wallet to play.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {error && (
          <div className="mt-4">
            <Notice kind="err">{error}</Notice>
          </div>
        )}
        {result && (
          <p className="text-xs text-fog/70 mt-6 text-center break-all">
            nonce {result.nonce} · seed hash {result.seedHash.slice(0, 16)}… ·{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              verify
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
