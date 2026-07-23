"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";
import { usePractice } from "@/components/practice";
import { randomClientSeed, useClientSeed } from "@/components/use-client-seed";
import { useHouseConfig } from "@/components/use-house-config";
import { FairCommit } from "@/components/fair-commit";
import { BountyStandings } from "@/components/bounty-standings";
import { GameBountyStrip } from "@/components/game-bounty-strip";
import { FirstVisitHint } from "@/components/first-visit-hint";

type DiceResult = {
  outcome: { rolled: number; target: number; multiplier: number };
  payout: number;
  win: boolean;
  credits: number;
  nonce: number;
  seedHash: string;
};

export default function DicePage() {
  const { me, refresh, loading } = useSession();
  const [target, setTarget] = useState(50);
  const [wager, setWager] = useState(5);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<DiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  // Guests default to the playable Sandbox (Live table needs a signed-in
  // wallet). ONCE, when the session first resolves — never again, so a
  // transient session blip mid-play can't yank a live player into practice,
  // and a manual toggle is never overridden.
  const sandboxDefaulted = useRef(false);
  useEffect(() => {
    if (loading || sandboxDefaulted.current) return;
    sandboxDefaulted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!me.signedIn) setSandbox(true);
  }, [loading, me.signedIn]);
  const practice = usePractice();
  const { seed: clientSeed } = useClientSeed();
  const house = useHouseConfig();

  const multiplier = (100 / target) * (1 - house.houseEdge); // live edge
  const balance = sandbox ? practice.credits : (me.credits ?? 0);
  const canPlay = sandbox || me.signedIn;

  const play = async () => {
    setRolling(true);
    setError(null);

    if (sandbox) {
      // Practice table: same odds, local roll, zero $RIBBIT. Bottomless
      // bankroll — top up first so the roll can never be blocked.
      practice.ensure(wager);
      const rolled = Math.floor(Math.random() * 100 * 100) / 100;
      const win = rolled < target;
      const payout = win ? Math.floor(wager * multiplier) : 0;
      practice.adjust(-wager + payout);
      await new Promise((r) => setTimeout(r, 700));
      setResult({
        outcome: { rolled, target, multiplier },
        payout,
        win,
        credits: 0,
        nonce: 0,
        seedHash: "",
      });
      if (win) celebrate();
      setRolling(false);
      return;
    }

    // finally-guarded so a network blip can't leave the die stuck rolling.
    try {
      const res = await fetch("/api/games/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, wager, clientSeed: clientSeed || randomClientSeed() }),
      });
      const data = await res.json();
      await new Promise((r) => setTimeout(r, 600));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setResult(data);
        if (data.win) celebrate();
        await refresh();
        window.dispatchEvent(new Event("owp:round")); // live-update the bounty meter
      }
    } catch {
      setError("Connection hiccup — check your balance before retrying.");
      await refresh().catch(() => {});
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="pt-6 max-w-2xl lg:max-w-5xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        compact
        kicker="Wing I — table 02"
        title="Pond Dice"
        desc="Set your own line and roll under it. Lower target, bigger multiplier."
      />

      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      {/* Mobile: the strip is the at-a-glance header (standings stack far
          below). Desktop: hidden — the full standings sit beside the game. */}
      <div className="lg:hidden">
        <GameBountyStrip game="dice" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
      <div className="panel panel-glow game-stage p-5 sm:p-6">
        {!sandbox && house.gamesPaused && (
          <div className="mb-4">
            <Notice kind="info">Live tables are paused by the house right now — the sandbox above still works.</Notice>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div className="chips">
            <button className={`chip ${!sandbox ? "active" : ""}`} aria-pressed={!sandbox} onClick={() => setSandbox(false)}>
              Live table
            </button>
            <button className={`chip ${sandbox ? "active" : ""}`} aria-pressed={sandbox} onClick={() => setSandbox(true)}>
              Sandbox
            </button>
          </div>
          <div className="text-right">
            <div className="kicker !text-[0.6rem]">{sandbox ? "Practice credits" : "Credits"}</div>
            <div className="stat-number text-neon">{canPlay ? balance : "—"}</div>
          </div>
        </div>
        {sandbox && (
          <div className="mb-5">
            <Notice kind="info">
              Sandbox — no wallet needed, no $RIBBIT involved. Same odds,
              bottomless practice bankroll: play as long as you like.
            </Notice>
          </div>
        )}
        {/* Result track */}
        <div
          className="relative h-12 rounded-lg mb-1 overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, oklch(0.13 0.01 165), oklch(0.16 0.012 165))",
            border: "1px solid var(--hairline-strong)",
            boxShadow: "inset 0 2px 10px oklch(0 0 0 / 0.45)",
          }}
        >
          {/* win zone with a soft falloff toward the line */}
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${target}%`,
              background:
                "linear-gradient(90deg, oklch(0.78 0.11 150 / 0.06), oklch(0.78 0.11 150 / 0.2))",
              borderRight: "2px solid var(--color-neon)",
              boxShadow: "4px 0 14px -6px oklch(0.78 0.11 150 / 0.6)",
            }}
          />
          {/* measured ticks every 10 */}
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="absolute bottom-0 w-px h-2"
              style={{ left: `${(i + 1) * 10}%`, background: "oklch(1 0 0 / 0.14)" }}
            />
          ))}
          {rolling && <div className="dice-scan" aria-hidden />}
          {result && !rolling && (
            <div
              className="dice-marker absolute top-1/2"
              style={{ left: `${result.outcome.rolled}%` }}
              title={`rolled ${result.outcome.rolled}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/art/owp_dice_orb.png"
                alt=""
                className="block w-7 h-7 -translate-x-1/2 -translate-y-1/2"
                style={{
                  filter: result.win
                    ? "drop-shadow(0 0 10px oklch(0.78 0.11 150 / 0.95))"
                    : "drop-shadow(0 0 10px oklch(0.64 0.18 25 / 0.9))",
                }}
              />
            </div>
          )}
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neon">
            win zone &lt; {target}
          </span>
        </div>
        <div
          className="flex justify-between mono text-[0.6rem] px-0.5 mb-2"
          style={{ color: "var(--text-dim)" }}
        >
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
        <input
          type="range"
          min={2}
          max={98}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="w-full accent-neon mb-6"
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
            min={house.minWager}
            max={house.maxWager}
            aria-label="Wager in credits"
            value={wager || ""}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              setWager(Number.isFinite(n) && n > 0 ? Math.min(house.maxWager, n) : 0);
            }}
          />
          <span className="text-sm text-fog">credits</span>
        </div>

        {result && !rolling && (
          <div
            className={`stat-number text-center text-2xl mb-4 result-pop ${result.win ? "neon-text" : "text-danger"}`}
          >
            rolled {result.outcome.rolled.toFixed(2)} —{" "}
            {result.win ? `+${result.payout} credits!` : "under the water it goes."}
          </div>
        )}

        <div className="text-center">
          <button
            className="btn btn-primary text-lg px-12 py-3"
            onClick={play}
            disabled={rolling || !canPlay || wager < house.minWager || (!sandbox && (house.gamesPaused || balance < wager))}
          >
            {rolling ? "Rolling…" : sandbox ? "Roll (practice)" : "Roll"}
          </button>
        </div>

        {!sandbox && !me.signedIn && (
          <p className="text-fog text-sm mt-4 text-center">
            Sign in with your wallet to play — or try the sandbox above.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {!sandbox && me.signedIn && balance < wager && (
          <p className="text-fog text-sm mt-4 text-center">
            Not enough credits.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get more credits →
            </Link>
          </p>
        )}
        {error && (
          <div className="mt-4">
            <Notice kind="err">{error}</Notice>
          </div>
        )}
        {result && !sandbox && result.seedHash && (
          <p className="text-xs text-fog/70 mt-6 text-center break-all">
            nonce {result.nonce} · seed hash {result.seedHash.slice(0, 16)}… ·{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              verify
            </Link>
          </p>
        )}
        {result && sandbox && (
          <p className="text-xs mt-6 text-center" style={{ color: "var(--text-dim)" }}>
            practice round — nothing wagered, nothing won
          </p>
        )}
        {!sandbox && <FairCommit clientSeed={clientSeed} />}
      </div>
        <BountyStandings game="dice" />
      </div>
    </div>
  );
}
