"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";

type FlipResult = {
  outcome: { landed: "frog" | "fly" };
  payout: number;
  win: boolean;
  credits: number;
  nonce: number;
  seedHash: string;
};

export default function FlipPage() {
  const { me, refresh } = useSession();
  const [side, setSide] = useState<"frog" | "fly">("frog");
  const [wager, setWager] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<FlipResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const play = async () => {
    // Fresh player entropy per round; it's echoed back in round history for
    // independent verification.
    const clientSeed = Math.random().toString(36).slice(2, 12);
    setSpinning(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/flip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, wager, clientSeed }),
    });
    const data = await res.json();
    // Let the coin spin a beat before revealing.
    await new Promise((r) => setTimeout(r, 900));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
    } else {
      setResult(data);
      await refresh();
    }
    setSpinning(false);
  };

  return (
    <div className="pt-10 max-w-2xl mx-auto">
      <SectionTitle
        kicker="Wing I — table 01"
        title="Frog Flip"
        desc="Frog or fly, even odds, 1.92× payout on a win — 4% published edge."
      />

      <div className="panel panel-glow p-8 text-center">
        <div
          className={`text-8xl mb-6 inline-block transition-transform duration-700 ${
            spinning ? "animate-spin" : ""
          }`}
        >
          {spinning ? "🪙" : result ? (result.outcome.landed === "frog" ? "🐸" : "🪰") : "🪙"}
        </div>

        {result && !spinning && (
          <div className={`stat-number text-2xl mb-4 ${result.win ? "neon-text" : "text-danger"}`}>
            {result.win ? `+${result.payout} credits!` : "The pond takes it."}
          </div>
        )}

        <div className="flex justify-center gap-3 mb-6">
          {(["frog", "fly"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`btn text-lg px-8 ${side === s ? "btn-primary" : "btn-ghost"}`}
            >
              {s === "frog" ? "🐸 Frog" : "🪰 Fly"}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <label className="text-sm text-fog">Wager</label>
          <input
            type="number"
            className="input max-w-28 text-center"
            min={1}
            max={1000}
            value={wager}
            onChange={(e) => setWager(Math.max(1, Math.floor(Number(e.target.value))))}
          />
          <span className="text-sm text-fog">
            credits → win <span className="text-neon">{Math.floor(wager * 1.92)}</span>
          </span>
        </div>

        <button
          className="btn btn-primary text-lg px-12 py-3"
          onClick={play}
          disabled={spinning || !me.signedIn || (me.credits ?? 0) < wager}
        >
          {spinning ? "Flipping…" : "Flip it"}
        </button>

        {!me.signedIn && (
          <p className="text-fog text-sm mt-4">
            Sign in with your wallet to play.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {me.signedIn && (me.credits ?? 0) < wager && (
          <p className="text-fog text-sm mt-4">
            Not enough credits.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Burn $RIBBIT for more →
            </Link>
          </p>
        )}
        {error && (
          <div className="mt-4">
            <Notice kind="err">{error}</Notice>
          </div>
        )}

        {result && (
          <p className="text-xs text-fog/70 mt-6 break-all">
            round nonce {result.nonce} · seed hash {result.seedHash.slice(0, 16)}… ·{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              verify
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
